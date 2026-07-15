// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/security/Pausable.sol";

/**
 * @title ERC20TrancheToken
 * @dev ERC-20 token for investor positions in credit deals/tranches
 * Features:
 * - Mintable by authorized roles
 * - Burnable by authorized roles
 * - Pausable for emergency stops
 * - Whitelist support (optional, via AccessControl)
 * - Transfer restrictions (optional)
 */
contract ERC20TrancheToken is ERC20, AccessControl, Pausable {
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");
    bytes32 public constant BURNER_ROLE = keccak256("BURNER_ROLE");
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");

    bool public transferRestricted;
    mapping(address => bool) public whitelist;

    event WhitelistUpdated(address indexed account, bool isWhitelisted);
    event TransferRestrictionUpdated(bool restricted);

    constructor(
        string memory name,
        string memory symbol,
        address admin
    ) ERC20(name, symbol) {
        _setupRole(DEFAULT_ADMIN_ROLE, admin);
        _setupRole(MINTER_ROLE, admin);
        _setupRole(BURNER_ROLE, admin);
        _setupRole(PAUSER_ROLE, admin);
        transferRestricted = true;
    }

    /**
     * @dev Mint tokens to an address
     * @param to Address to mint to
     * @param amount Amount to mint (in token units, will be multiplied by decimals)
     */
    function mint(address to, uint256 amount) external onlyRole(MINTER_ROLE) whenNotPaused {
        _mint(to, amount);
    }

    /**
     * @dev Burn tokens from an address
     * @param from Address to burn from
     * @param amount Amount to burn
     */
    function burn(address from, uint256 amount) external onlyRole(BURNER_ROLE) whenNotPaused {
        _burn(from, amount);
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
     * @dev Override transfer to enforce whitelist if transfer is restricted
     */
    function _beforeTokenTransfer(
        address from,
        address to,
        uint256 amount
    ) internal virtual override {
        super._beforeTokenTransfer(from, to, amount);

        if (transferRestricted && from != address(0) && to != address(0)) {
            require(whitelist[from] || whitelist[to], "ERC20TrancheToken: transfer restricted to whitelisted addresses");
        }
    }
}
