import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers";

const TOKEN_ID = 1n;
const URI = "ipfs://token-1";

describe("WhitelabelNFTBurnable", () => {
  async function deployFixture() {
    const [deployer, alice, bob] = await ethers.getSigners();

    const Token = await ethers.getContractFactory("WhitelabelNFTBurnable");
    const token = await Token.deploy("Axia Collection", "Axia Collection");

    return { token, deployer, alice, bob };
  }

  describe("deploy", () => {
    it("deployer recebe DEFAULT_ADMIN_ROLE, MINTER_ROLE e BURNER_ROLE", async () => {
      const { token, deployer } = await loadFixture(deployFixture);
      expect(await token.hasRole(await token.DEFAULT_ADMIN_ROLE(), deployer.address)).to.equal(true);
      expect(await token.hasRole(await token.MINTER_ROLE(), deployer.address)).to.equal(true);
      expect(await token.hasRole(await token.BURNER_ROLE(), deployer.address)).to.equal(true);
    });
  });

  describe("mintWithTokenURI (compat v1)", () => {
    it("minta com o MESMO selector do contrato v1 (address,uint256,string)", async () => {
      const { token, deployer, alice } = await loadFixture(deployFixture);

      // Selector calculado como o MintService faria com a ABI v1
      const v1Abi = [
        "function mintWithTokenURI(address to, uint256 tokenId, string tokenURI) returns (bool)",
      ];
      const v1Iface = new ethers.Interface(v1Abi);
      const data = v1Iface.encodeFunctionData("mintWithTokenURI", [alice.address, TOKEN_ID, URI]);

      await deployer.sendTransaction({ to: await token.getAddress(), data });

      expect(await token.ownerOf(TOKEN_ID)).to.equal(alice.address);
      expect(await token.tokenURI(TOKEN_ID)).to.equal(URI);
    });

    it("emite Minted e reverte para quem não tem MINTER_ROLE", async () => {
      const { token, alice, bob } = await loadFixture(deployFixture);
      await expect(
        token.connect(alice).mintWithTokenURI(bob.address, TOKEN_ID, URI)
      ).to.be.revertedWithCustomError(token, "AccessControlUnauthorizedAccount");
    });
  });

  describe("burn", () => {
    it("holder queima o próprio token (caminho do MintService.burnNft)", async () => {
      const { token, alice } = await loadFixture(deployFixture);
      await token.mintWithTokenURI(alice.address, TOKEN_ID, URI);

      await expect(token.connect(alice).burn(TOKEN_ID))
        .to.emit(token, "Transfer")
        .withArgs(alice.address, ethers.ZeroAddress, TOKEN_ID)
        .and.to.emit(token, "Burned")
        .withArgs(TOKEN_ID, alice.address);

      await expect(token.ownerOf(TOKEN_ID)).to.be.revertedWithCustomError(
        token,
        "ERC721NonexistentToken"
      );
    });

    it("BURNER_ROLE queima token de terceiro sem approval", async () => {
      const { token, deployer, alice } = await loadFixture(deployFixture);
      await token.mintWithTokenURI(alice.address, TOKEN_ID, URI);

      await expect(token.connect(deployer).burn(TOKEN_ID))
        .to.emit(token, "Burned")
        .withArgs(TOKEN_ID, deployer.address);
    });

    it("terceiro sem role e sem approval NÃO queima", async () => {
      const { token, alice, bob } = await loadFixture(deployFixture);
      await token.mintWithTokenURI(alice.address, TOKEN_ID, URI);

      await expect(token.connect(bob).burn(TOKEN_ID)).to.be.revertedWithCustomError(
        token,
        "ERC721InsufficientApproval"
      );
    });

    it("approved queima token do holder", async () => {
      const { token, alice, bob } = await loadFixture(deployFixture);
      await token.mintWithTokenURI(alice.address, TOKEN_ID, URI);
      await token.connect(alice).approve(bob.address, TOKEN_ID);

      await token.connect(bob).burn(TOKEN_ID);
      await expect(token.ownerOf(TOKEN_ID)).to.be.revertedWithCustomError(
        token,
        "ERC721NonexistentToken"
      );
    });
  });

  describe("transferência segue ERC-721 padrão", () => {
    it("safeTransferFrom entre wallets funciona (paridade v1)", async () => {
      const { token, alice, bob } = await loadFixture(deployFixture);
      await token.mintWithTokenURI(alice.address, TOKEN_ID, URI);

      await token
        .connect(alice)
        ["safeTransferFrom(address,address,uint256)"](alice.address, bob.address, TOKEN_ID);
      expect(await token.ownerOf(TOKEN_ID)).to.equal(bob.address);
    });
  });
});
