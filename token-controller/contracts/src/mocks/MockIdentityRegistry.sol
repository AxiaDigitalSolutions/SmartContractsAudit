// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IIdentityRegistry} from "../interfaces/IIdentityRegistry.sol";

/// @dev Mock de teste — NÃO usar em produção. A registry real é a do T-REX.
contract MockIdentityRegistry is IIdentityRegistry {
    mapping(address => bool) private _verified;
    mapping(address => address) private _identity;
    mapping(address => uint16) private _country;

    function setVerified(address account, bool value) external {
        _verified[account] = value;
    }

    function setIdentity(address account, address id, uint16 country) external {
        _identity[account] = id;
        _country[account] = country;
    }

    function isVerified(address account) external view override returns (bool) {
        return _verified[account];
    }

    function identity(address account) external view override returns (address) {
        return _identity[account];
    }

    function investorCountry(address account) external view override returns (uint16) {
        return _country[account];
    }
}
