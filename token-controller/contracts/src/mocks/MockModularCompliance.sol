// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IModularCompliance} from "../interfaces/IModularCompliance.sol";

/// @dev Mock de teste — NÃO usar em produção. A compliance real é a do T-REX.
contract MockModularCompliance is IModularCompliance {
    bool public allow = true;

    uint256 public transferredCalls;
    uint256 public createdCalls;
    uint256 public destroyedCalls;

    function setAllow(bool value) external {
        allow = value;
    }

    function canTransfer(address, address, uint256) external view override returns (bool) {
        return allow;
    }

    function transferred(address, address, uint256) external override {
        transferredCalls++;
    }

    function created(address, uint256) external override {
        createdCalls++;
    }

    function destroyed(address, uint256) external override {
        destroyedCalls++;
    }
}
