// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "@openzeppelin/contracts/utils/Strings.sol";

/**
 * @title ERC1155ReceivableToken
 * @dev ERC-1155 token for receivable/charge assets
 * Features:
 * - Each receivable/charge = unique tokenId
 * - Mintable by authorized roles
 * - Burnable by authorized roles
 * - Pausable for emergency stops
 * - Metadata URI support (IPFS)
 * - Whitelist support (optional)
 * - Transfer restrictions (optional)
 */
contract ERC1155ReceivableToken is ERC1155, AccessControl, Pausable {
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");
    bytes32 public constant BURNER_ROLE = keccak256("BURNER_ROLE");
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");
    bytes32 public constant URI_SETTER_ROLE = keccak256("URI_SETTER_ROLE");

    bool public transferRestricted;
    mapping(address => bool) public whitelist;
    mapping(uint256 => string) private _tokenURIs;
    string private _baseURI;

    event WhitelistUpdated(address indexed account, bool isWhitelisted);
    event TransferRestrictionUpdated(bool restricted);
    event TokenURIUpdated(uint256 indexed tokenId, string uri);

    constructor(
        string memory baseURI_,
        address admin
    ) ERC1155(baseURI_) {
        _setupRole(DEFAULT_ADMIN_ROLE, admin);
        _setupRole(MINTER_ROLE, admin);
        _setupRole(BURNER_ROLE, admin);
        _setupRole(PAUSER_ROLE, admin);
        _setupRole(URI_SETTER_ROLE, admin);
        _baseURI = baseURI_;
        transferRestricted = true;
    }

    /**
     * @dev Mint tokens for a specific tokenId
     * @param to Address to mint to
     * @param id Token ID (typically receivable_id or charge_id)
     * @param amount Amount to mint
     * @param data Additional data
     */
    function mint(
        address to,
        uint256 id,
        uint256 amount,
        bytes memory data
    ) external onlyRole(MINTER_ROLE) whenNotPaused {
        _mint(to, id, amount, data);
    }

    /**
     * @dev Batch mint tokens
     */
    function mintBatch(
        address to,
        uint256[] memory ids,
        uint256[] memory amounts,
        bytes memory data
    ) external onlyRole(MINTER_ROLE) whenNotPaused {
        _mintBatch(to, ids, amounts, data);
    }

    /**
     * @dev Burn tokens from an address
     * @param from Address to burn from
     * @param id Token ID
     * @param amount Amount to burn
     */
    function burn(
        address from,
        uint256 id,
        uint256 amount
    ) external onlyRole(BURNER_ROLE) whenNotPaused {
        _burn(from, id, amount);
    }

    /**
     * @dev Batch burn tokens
     */
    function burnBatch(
        address from,
        uint256[] memory ids,
        uint256[] memory amounts
    ) external onlyRole(BURNER_ROLE) whenNotPaused {
        _burnBatch(from, ids, amounts);
    }

    /**
     * @dev Pause all token operations
     */
    function pause() external onlyRole(PAUSER_ROLE) {
        _pause();
    }

    /**
     * @dev Unpause all token operations
     */
    function unpause() external onlyRole(PAUSER_ROLE) {
        _unpause();
    }

    /**
     * @dev Set base URI for metadata
     */
    function setBaseURI(string memory newBaseURI) external onlyRole(URI_SETTER_ROLE) {
        _baseURI = newBaseURI;
        _setURI(newBaseURI);
    }

    /**
     * @dev Set URI for a specific token
     */
    function setTokenURI(uint256 tokenId, string memory tokenURI) external onlyRole(URI_SETTER_ROLE) {
        _tokenURIs[tokenId] = tokenURI;
        emit TokenURIUpdated(tokenId, tokenURI);
    }

    /**
     * @dev Get URI for a specific token
     */
    function uri(uint256 tokenId) public view override returns (string memory) {
        string memory tokenURI = _tokenURIs[tokenId];
        if (bytes(tokenURI).length > 0) {
            return tokenURI;
        }
        return string(abi.encodePacked(_baseURI, Strings.toString(tokenId)));
    }

    /**
     * @dev Add or remove address from whitelist
     */
    function updateWhitelist(address account, bool isWhitelisted) external onlyRole(DEFAULT_ADMIN_ROLE) {
        whitelist[account] = isWhitelisted;
        emit WhitelistUpdated(account, isWhitelisted);
    }

    /**
     * @dev Set transfer restriction
     */
    function setTransferRestricted(bool restricted) external onlyRole(DEFAULT_ADMIN_ROLE) {
        transferRestricted = restricted;
        emit TransferRestrictionUpdated(restricted);
    }

    /**
     * @dev Override _beforeTokenTransfer to enforce whitelist if transfer is restricted
     */
    function _beforeTokenTransfer(
        address operator,
        address from,
        address to,
        uint256[] memory ids,
        uint256[] memory amounts,
        bytes memory data
    ) internal virtual override {
        super._beforeTokenTransfer(operator, from, to, ids, amounts, data);

        if (transferRestricted && from != address(0) && to != address(0)) {
            require(whitelist[from] || whitelist[to], "ERC1155ReceivableToken: transfer restricted to whitelisted addresses");
        }
    }

    /**
     * @dev Support for ERC165
     */
    function supportsInterface(bytes4 interfaceId)
        public
        view
        virtual
        override(ERC1155, AccessControl)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }
}
