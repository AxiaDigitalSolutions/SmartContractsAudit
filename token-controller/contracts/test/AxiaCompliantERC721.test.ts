import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers";

const TOKEN_ID = 1n;
const URI = "ipfs://token-1";

describe("AxiaCompliantERC721", () => {
  async function deployFixture() {
    const [admin, alice, bob, carol, newWallet] = await ethers.getSigners();

    const Registry = await ethers.getContractFactory("MockIdentityRegistry");
    const registry = await Registry.deploy();

    const Compliance = await ethers.getContractFactory("MockModularCompliance");
    const compliance = await Compliance.deploy();

    const Token = await ethers.getContractFactory("AxiaCompliantERC721");
    const token = await Token.deploy(
      "Axia Regulated NFT",
      "AXNFT",
      await registry.getAddress(),
      await compliance.getAddress(),
      admin.address
    );

    return { token, registry, compliance, admin, alice, bob, carol, newWallet };
  }

  describe("mint", () => {
    it("agente minta para destinatário verificado e notifica compliance", async () => {
      const { token, registry, compliance, alice } = await loadFixture(deployFixture);
      await registry.setVerified(alice.address, true);

      await expect(token.mint(alice.address, TOKEN_ID, URI))
        .to.emit(token, "Minted")
        .withArgs(alice.address, TOKEN_ID);

      expect(await token.ownerOf(TOKEN_ID)).to.equal(alice.address);
      expect(await token.tokenURI(TOKEN_ID)).to.equal(URI);
      expect(await compliance.createdCalls()).to.equal(1n);
    });

    it("reverte mint para destinatário NÃO verificado", async () => {
      const { token, alice } = await loadFixture(deployFixture);
      await expect(
        token.mint(alice.address, TOKEN_ID, URI)
      ).to.be.revertedWithCustomError(token, "ReceiverNotVerified");
    });

    it("reverte mint de quem não é agente", async () => {
      const { token, registry, alice, bob } = await loadFixture(deployFixture);
      await registry.setVerified(bob.address, true);
      await expect(
        token.connect(alice).mint(bob.address, TOKEN_ID, URI)
      ).to.be.revertedWithCustomError(token, "AccessControlUnauthorizedAccount");
    });
  });

  describe("transfer (usuário)", () => {
    async function mintedFixture() {
      const ctx = await loadFixture(deployFixture);
      await ctx.registry.setVerified(ctx.alice.address, true);
      await ctx.registry.setVerified(ctx.bob.address, true);
      await ctx.token.mint(ctx.alice.address, TOKEN_ID, URI);
      return ctx;
    }

    it("transfere entre verificados quando compliance permite", async () => {
      const { token, compliance, alice, bob } = await mintedFixture();
      await token.connect(alice).transferFrom(alice.address, bob.address, TOKEN_ID);
      expect(await token.ownerOf(TOKEN_ID)).to.equal(bob.address);
      expect(await compliance.transferredCalls()).to.equal(1n);
    });

    it("reverte se destinatário não verificado", async () => {
      const { token, alice, carol } = await mintedFixture();
      await expect(
        token.connect(alice).transferFrom(alice.address, carol.address, TOKEN_ID)
      ).to.be.revertedWithCustomError(token, "ReceiverNotVerified");
    });

    it("reverte se compliance nega", async () => {
      const { token, compliance, alice, bob } = await mintedFixture();
      await compliance.setAllow(false);
      await expect(
        token.connect(alice).transferFrom(alice.address, bob.address, TOKEN_ID)
      ).to.be.revertedWithCustomError(token, "ComplianceFailure");
    });

    it("reverte se remetente congelado", async () => {
      const { token, alice, bob } = await mintedFixture();
      await token.setAddressFrozen(alice.address, true);
      await expect(
        token.connect(alice).transferFrom(alice.address, bob.address, TOKEN_ID)
      ).to.be.revertedWithCustomError(token, "SenderFrozen");
    });

    it("reverte se token congelado", async () => {
      const { token, alice, bob } = await mintedFixture();
      await token.setTokenFrozen(TOKEN_ID, true);
      await expect(token.connect(alice).transferFrom(alice.address, bob.address, TOKEN_ID))
        .to.be.revertedWithCustomError(token, "TokenIsFrozen")
        .withArgs(TOKEN_ID);
    });

    it("reverte quando pausado", async () => {
      const { token, alice, bob } = await mintedFixture();
      await token.pause();
      await expect(
        token.connect(alice).transferFrom(alice.address, bob.address, TOKEN_ID)
      ).to.be.revertedWithCustomError(token, "TransfersPaused");
    });
  });

  describe("forcedTransfer / recover (agente)", () => {
    async function mintedFixture() {
      const ctx = await loadFixture(deployFixture);
      await ctx.registry.setVerified(ctx.alice.address, true);
      await ctx.registry.setVerified(ctx.bob.address, true);
      await ctx.token.mint(ctx.alice.address, TOKEN_ID, URI);
      return ctx;
    }

    it("forcedTransfer ignora congelamento mas exige destino verificado", async () => {
      const { token, admin, alice, bob } = await mintedFixture();
      await token.setAddressFrozen(alice.address, true);
      await expect(token.forcedTransfer(alice.address, bob.address, TOKEN_ID))
        .to.emit(token, "ForcedTransfer")
        .withArgs(alice.address, bob.address, TOKEN_ID, admin.address);
      expect(await token.ownerOf(TOKEN_ID)).to.equal(bob.address);
    });

    it("forcedTransfer reverte se destino não verificado", async () => {
      const { token, alice, carol } = await mintedFixture();
      await expect(
        token.forcedTransfer(alice.address, carol.address, TOKEN_ID)
      ).to.be.revertedWithCustomError(token, "ReceiverNotVerified");
    });

    it("recover move token para nova wallet verificada do mesmo ONCHAINID", async () => {
      const { token, registry, alice, newWallet } = await mintedFixture();
      await registry.setVerified(newWallet.address, true);
      const onchainId = ethers.Wallet.createRandom().address;
      await registry.setIdentity(alice.address, onchainId, 76);
      await registry.setIdentity(newWallet.address, onchainId, 76);

      await expect(
        token.recover(alice.address, newWallet.address, onchainId, TOKEN_ID)
      )
        .to.emit(token, "RecoverySuccess")
        .withArgs(alice.address, newWallet.address, onchainId);

      expect(await token.ownerOf(TOKEN_ID)).to.equal(newWallet.address);
    });

    it("recover reverte se as wallets não compartilham o mesmo ONCHAINID", async () => {
      const { token, registry, alice, newWallet } = await mintedFixture();
      await registry.setVerified(newWallet.address, true);
      const onchainId = ethers.Wallet.createRandom().address;
      const otherId = ethers.Wallet.createRandom().address;
      await registry.setIdentity(alice.address, onchainId, 76);
      await registry.setIdentity(newWallet.address, otherId, 76);

      await expect(
        token.recover(alice.address, newWallet.address, onchainId, TOKEN_ID)
      ).to.be.revertedWithCustomError(token, "IdentityMismatch");
    });

    // Regressão HSEC-01/02: a flag `_forced` não pode sobreviver ao callback
    // onERC721Received. Um receiver malicioso que reentra durante um
    // forcedTransfer COM o contrato pausado deve falhar ao tentar burlar a pausa.
    it("forcedTransfer não permite reentrância burlar a pausa (_forced consumido)", async () => {
      const { token, registry, alice, carol } = await mintedFixture();

      const Attacker = await ethers.getContractFactory("MockReentrantReceiver");
      const attacker = await Attacker.deploy();
      await registry.setVerified(await attacker.getAddress(), true);
      await registry.setVerified(carol.address, true);
      await attacker.arm(await token.getAddress(), carol.address);

      await token.pause();

      // O reentry tenta transferFrom(attacker -> carol) com o contrato pausado.
      // Com _forced já consumido, o _update reverte TransfersPaused, derrubando
      // todo o forcedTransfer. O token NÃO vaza para carol.
      await expect(
        token.forcedTransfer(alice.address, await attacker.getAddress(), TOKEN_ID)
      ).to.be.revertedWithCustomError(token, "TransfersPaused");

      expect(await token.ownerOf(TOKEN_ID)).to.equal(alice.address);
    });
  });

  describe("burn", () => {
    it("agente queima e notifica compliance", async () => {
      const { token, registry, compliance, alice } = await loadFixture(deployFixture);
      await registry.setVerified(alice.address, true);
      await token.mint(alice.address, TOKEN_ID, URI);

      await expect(token.burn(TOKEN_ID)).to.emit(token, "Burned").withArgs(TOKEN_ID);
      await expect(token.ownerOf(TOKEN_ID)).to.be.revertedWithCustomError(
        token,
        "ERC721NonexistentToken"
      );
      expect(await compliance.destroyedCalls()).to.equal(1n);
    });

    it("reverte burn de quem não é agente", async () => {
      const { token, registry, alice } = await loadFixture(deployFixture);
      await registry.setVerified(alice.address, true);
      await token.mint(alice.address, TOKEN_ID, URI);
      await expect(token.connect(alice).burn(TOKEN_ID)).to.be.revertedWithCustomError(
        token,
        "AccessControlUnauthorizedAccount"
      );
    });
  });

  describe("controle de acesso admin", () => {
    it("apenas agente congela endereço", async () => {
      const { token, alice, bob } = await loadFixture(deployFixture);
      await expect(
        token.connect(alice).setAddressFrozen(bob.address, true)
      ).to.be.revertedWithCustomError(token, "AccessControlUnauthorizedAccount");
    });

    it("apenas admin troca a Identity Registry", async () => {
      const { token, registry, alice } = await loadFixture(deployFixture);
      await expect(
        token.connect(alice).setIdentityRegistry(await registry.getAddress())
      ).to.be.revertedWithCustomError(token, "AccessControlUnauthorizedAccount");
    });

    it("admin troca registry e compliance (emite eventos)", async () => {
      const { token, registry, compliance } = await loadFixture(deployFixture);
      await expect(token.setIdentityRegistry(await registry.getAddress()))
        .to.emit(token, "IdentityRegistrySet")
        .withArgs(await registry.getAddress());
      await expect(token.setCompliance(await compliance.getAddress()))
        .to.emit(token, "ComplianceSet")
        .withArgs(await compliance.getAddress());
    });

    it("reverte ao setar registry/compliance zero", async () => {
      const { token } = await loadFixture(deployFixture);
      await expect(
        token.setIdentityRegistry(ethers.ZeroAddress)
      ).to.be.revertedWithCustomError(token, "ZeroAddress");
      await expect(
        token.setCompliance(ethers.ZeroAddress)
      ).to.be.revertedWithCustomError(token, "ZeroAddress");
    });
  });

  describe("ciclo de freeze/pause e recover (cobertura de ramos)", () => {
    async function mintedFixture() {
      const ctx = await loadFixture(deployFixture);
      await ctx.registry.setVerified(ctx.alice.address, true);
      await ctx.registry.setVerified(ctx.bob.address, true);
      await ctx.token.mint(ctx.alice.address, TOKEN_ID, URI);
      return ctx;
    }

    it("unpause restaura a transferência de usuário", async () => {
      const { token, alice, bob } = await mintedFixture();
      await token.pause();
      await token.unpause();
      await token.connect(alice).transferFrom(alice.address, bob.address, TOKEN_ID);
      expect(await token.ownerOf(TOKEN_ID)).to.equal(bob.address);
    });

    it("descongelar token permite a transferência", async () => {
      const { token, alice, bob } = await mintedFixture();
      await token.setTokenFrozen(TOKEN_ID, true);
      await token.setTokenFrozen(TOKEN_ID, false);
      await token.connect(alice).transferFrom(alice.address, bob.address, TOKEN_ID);
      expect(await token.ownerOf(TOKEN_ID)).to.equal(bob.address);
    });

    it("forcedTransfer funciona mesmo com o contrato pausado", async () => {
      const { token, alice, bob } = await mintedFixture();
      await token.pause();
      await token.forcedTransfer(alice.address, bob.address, TOKEN_ID);
      expect(await token.ownerOf(TOKEN_ID)).to.equal(bob.address);
    });

    it("recover reverte se oldWallet não é o dono", async () => {
      const { token, registry, bob, newWallet } = await mintedFixture();
      await registry.setVerified(newWallet.address, true);
      const fakeOnchainId = ethers.Wallet.createRandom().address;
      await expect(
        token.recover(bob.address, newWallet.address, fakeOnchainId, TOKEN_ID)
      ).to.be.revertedWithCustomError(token, "NotTokenOwner");
    });

    it("expõe supportsInterface (ERC721 + AccessControl)", async () => {
      const { token } = await loadFixture(deployFixture);
      // ERC721 = 0x80ac58cd, AccessControl (IAccessControl) = 0x7965db0b
      expect(await token.supportsInterface("0x80ac58cd")).to.equal(true);
      expect(await token.supportsInterface("0x7965db0b")).to.equal(true);
      expect(await token.supportsInterface("0xffffffff")).to.equal(false);
    });
  });
});
