// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {ERC721URIStorage} from "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

import {IIdentityRegistry} from "./interfaces/IIdentityRegistry.sol";
import {IModularCompliance} from "./interfaces/IModularCompliance.sol";

/**
 * @title AxiaCompliantERC721
 * @notice ERC-721 regulado que reaproveita a MESMA camada de identidade e
 *         compliance do ERC-3643 (T-REX): Identity Registry + Modular Compliance.
 *         Toda transferência de usuário exige destinatário verificado on-chain e
 *         aprovação das regras de compliance.
 *
 * @dev    ESQUELETO PRÉ-AUDITORIA. Entra no escopo de auditoria externa.
 *         Pontos marcados com `AUDIT:` são decisões de design a validar.
 *
 *         Semântica 3643 -> NFT:
 *           - "amount" do ModularCompliance é sempre 1 (uma unidade por token).
 *           - freeze parcial vira freeze por tokenId.
 *           - recovery move tokens de uma wallet perdida para a nova wallet
 *             vinculada ao MESMO ONCHAINID.
 *
 *         Matriz de enforcement por operação:
 *           MINT (agente)          -> exige receiver verificado; compliance.created
 *           BURN (agente)          -> sem checagem de receiver;  compliance.destroyed
 *           TRANSFER (usuário)     -> !paused, !frozen, verificado, canTransfer
 *           forcedTransfer (agente)-> ignora pause/freeze/canTransfer; exige verificado
 *           recover (agente)       -> idem forced; nova wallet verificada
 */
contract AxiaCompliantERC721 is ERC721URIStorage, AccessControl, Pausable, ReentrancyGuard {
    bytes32 public constant AGENT_ROLE = keccak256("AGENT_ROLE");

    error ZeroAddress();
    error ReceiverNotVerified();
    error TransfersPaused();
    error SenderFrozen();
    error ReceiverFrozen();
    error TokenIsFrozen(uint256 tokenId);
    error ComplianceFailure();
    error NotTokenOwner();
    error IdentityMismatch();

    IIdentityRegistry public identityRegistry;
    IModularCompliance public compliance;

    mapping(address => bool) public addressFrozen;
    mapping(uint256 => bool) public tokenFrozen;

    // Flag transitório: quando true, o _update pula pause/freeze/canTransfer
    // (operações privilegiadas do agente). Sempre resetado no mesmo tx.
    bool private _forced;

    event IdentityRegistrySet(address indexed registry);
    event ComplianceSet(address indexed compliance);
    event AddressFrozenSet(address indexed account, bool frozen, address indexed by);
    event TokenFrozenSet(uint256 indexed tokenId, bool frozen, address indexed by);
    event RecoverySuccess(address indexed oldWallet, address indexed newWallet, address indexed onchainId);
    event ForcedTransfer(address indexed from, address indexed to, uint256 indexed tokenId, address by);
    event Minted(address indexed to, uint256 indexed tokenId);
    event Burned(uint256 indexed tokenId);

    constructor(
        string memory name_,
        string memory symbol_,
        address identityRegistry_,
        address compliance_,
        address admin_
    ) ERC721(name_, symbol_) {
        if (identityRegistry_ == address(0)) revert ZeroAddress();
        if (compliance_ == address(0)) revert ZeroAddress();
        if (admin_ == address(0)) revert ZeroAddress();

        identityRegistry = IIdentityRegistry(identityRegistry_);
        compliance = IModularCompliance(compliance_);

        _grantRole(DEFAULT_ADMIN_ROLE, admin_);
        _grantRole(AGENT_ROLE, admin_);
    }

    // --------------------------------------------------------------------- //
    //  Núcleo de enforcement — hook único de transferência (OZ v5 `_update`) //
    // --------------------------------------------------------------------- //

    /**
     * @dev OZ v5 unifica mint/transfer/burn em `_update`:
     *        mint: from==0 | burn: to==0 | transfer: ambos !=0.
     * AUDIT: confirmar que cada operação efetivada chama compliance
     *        (created/transferred/destroyed) exatamente uma vez.
     */
    function _update(address to, uint256 tokenId, address auth)
        internal
        override
        returns (address from)
    {
        from = _ownerOf(tokenId);

        if (from == address(0)) {
            // MINT
            if (!identityRegistry.isVerified(to)) revert ReceiverNotVerified();
            from = super._update(to, tokenId, auth);
            compliance.created(to, 1);
        } else if (to == address(0)) {
            // BURN
            from = super._update(to, tokenId, auth);
            compliance.destroyed(from, 1);
        } else {
            // TRANSFER
            if (!identityRegistry.isVerified(to)) revert ReceiverNotVerified();
            // Consome a flag forçada IMEDIATAMENTE (efeito antes de qualquer
            // interação externa). Assim o privilégio nunca sobrevive ao callback
            // onERC721Received nem a um reentry da compliance — fecha a janela de
            // reentrância em que `transferFrom` herdado do OZ burlaria os checks.
            bool forced = _forced;
            _forced = false;
            if (!forced) {
                if (paused()) revert TransfersPaused();
                if (addressFrozen[from]) revert SenderFrozen();
                if (addressFrozen[to]) revert ReceiverFrozen();
                if (tokenFrozen[tokenId]) revert TokenIsFrozen(tokenId);
                if (!compliance.canTransfer(from, to, 1)) revert ComplianceFailure();
            }
            from = super._update(to, tokenId, auth);
            compliance.transferred(from, to, 1);
        }

        return from;
    }

    // --------------------------------------------------------------------- //
    //  Operações de agente (custódia Axia)                                  //
    // --------------------------------------------------------------------- //

    /**
     * @notice Minta um token regulado para uma wallet verificada e notifica a
     *         camada de compliance (`created`).
     * @param to       Destinatário; precisa estar verificado na Identity Registry.
     * @param tokenId  Identificador do token (casa com o id off-chain do journal).
     * @param uri      URI de metadados (tokenURI) do NFT.
     */
    function mint(address to, uint256 tokenId, string calldata uri)
        external
        onlyRole(AGENT_ROLE)
        nonReentrant
    {
        emit Minted(to, tokenId);
        _safeMint(to, tokenId);
        _setTokenURI(tokenId, uri);
    }

    /**
     * @notice Queima um token e notifica a camada de compliance (`destroyed`).
     * @param tokenId  Token a ser queimado.
     */
    function burn(uint256 tokenId) external onlyRole(AGENT_ROLE) nonReentrant {
        emit Burned(tokenId);
        _burn(tokenId);
    }

    /**
     * @notice Transferência forçada pelo agente (correção custodial, ordem
     *         judicial). Ignora pause/freeze/canTransfer; mantém a exigência de
     *         identidade verificada no destino.
     * @param from     Wallet de origem.
     * @param to       Wallet de destino; precisa estar verificada.
     * @param tokenId  Token a ser movido.
     */
    function forcedTransfer(address from, address to, uint256 tokenId)
        external
        onlyRole(AGENT_ROLE)
        nonReentrant
    {
        if (!identityRegistry.isVerified(to)) revert ReceiverNotVerified();
        emit ForcedTransfer(from, to, tokenId, _msgSender());
        _forced = true;
        _safeTransfer(from, to, tokenId, "");
        _forced = false;
    }

    /**
     * @notice Recupera tokens de uma wallet perdida para uma nova wallet vinculada
     *         ao MESMO ONCHAINID. A nova wallet precisa já estar verificada.
     * @dev    A vinculação ao ONCHAINID é validada ON-CHAIN: ambas as wallets
     *         precisam resolver para `onchainId` na Identity Registry.
     * @param oldWallet  Wallet de origem (dona atual do token).
     * @param newWallet  Nova wallet verificada do mesmo titular.
     * @param onchainId  Contrato ONCHAINID que deve vincular ambas as wallets.
     * @param tokenId    Token a ser recuperado.
     */
    function recover(address oldWallet, address newWallet, address onchainId, uint256 tokenId)
        external
        onlyRole(AGENT_ROLE)
        nonReentrant
    {
        if (!identityRegistry.isVerified(newWallet)) revert ReceiverNotVerified();
        if (_ownerOf(tokenId) != oldWallet) revert NotTokenOwner();
        if (
            onchainId == address(0) ||
            identityRegistry.identity(oldWallet) != onchainId ||
            identityRegistry.identity(newWallet) != onchainId
        ) revert IdentityMismatch();
        emit RecoverySuccess(oldWallet, newWallet, onchainId);
        _forced = true;
        _safeTransfer(oldWallet, newWallet, tokenId, "");
        _forced = false;
    }

    // --------------------------------------------------------------------- //
    //  Congelamento / pausa                                                 //
    // --------------------------------------------------------------------- //

    /// @notice Congela/descongela todas as transferências de uma wallet.
    /// @param account Wallet alvo. @param frozen Novo estado de congelamento.
    function setAddressFrozen(address account, bool frozen) external onlyRole(AGENT_ROLE) {
        addressFrozen[account] = frozen;
        emit AddressFrozenSet(account, frozen, _msgSender());
    }

    /// @notice Congela/descongela a transferência de um token específico.
    /// @param tokenId Token alvo. @param frozen Novo estado de congelamento.
    function setTokenFrozen(uint256 tokenId, bool frozen) external onlyRole(AGENT_ROLE) {
        tokenFrozen[tokenId] = frozen;
        emit TokenFrozenSet(tokenId, frozen, _msgSender());
    }

    /// @notice Pausa todas as transferências de usuário (operações de agente seguem).
    function pause() external onlyRole(AGENT_ROLE) { _pause(); }

    /// @notice Remove a pausa global de transferências.
    function unpause() external onlyRole(AGENT_ROLE) { _unpause(); }

    // --------------------------------------------------------------------- //
    //  Administração da camada compartilhada                                //
    // --------------------------------------------------------------------- //

    /// @notice Troca a Identity Registry consumida pelo contrato.
    /// @param registry_ Endereço da nova registry (não pode ser zero).
    function setIdentityRegistry(address registry_) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (registry_ == address(0)) revert ZeroAddress();
        identityRegistry = IIdentityRegistry(registry_);
        emit IdentityRegistrySet(registry_);
    }

    /// @notice Troca o contrato de Modular Compliance.
    /// @param compliance_ Endereço da nova compliance (não pode ser zero).
    function setCompliance(address compliance_) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (compliance_ == address(0)) revert ZeroAddress();
        compliance = IModularCompliance(compliance_);
        emit ComplianceSet(compliance_);
    }

    // --------------------------------------------------------------------- //
    //  Overrides obrigatórios (herança múltipla)                            //
    // --------------------------------------------------------------------- //

    function supportsInterface(bytes4 interfaceId)
        public
        view
        override(ERC721URIStorage, AccessControl)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }
}
