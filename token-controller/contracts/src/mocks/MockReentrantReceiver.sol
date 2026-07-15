// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {IERC721Receiver} from "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";

interface IAxiaCompliantERC721Min {
    function transferFrom(address from, address to, uint256 tokenId) external;
}

/// @dev Mock de teste — NÃO usar em produção. Simula um destinatário malicioso
///      que, no callback onERC721Received, tenta reentrar movendo o token recém
///      recebido para um terceiro, explorando a antiga janela da flag `_forced`.
contract MockReentrantReceiver is IERC721Receiver {
    address public target; // contrato AxiaCompliantERC721
    address public victim; // wallet destino do reentry

    function arm(address target_, address victim_) external {
        target = target_;
        victim = victim_;
    }

    function onERC721Received(
        address,
        address,
        uint256 tokenId,
        bytes calldata
    ) external override returns (bytes4) {
        if (target != address(0)) {
            // Tenta reentrar: mover o token recém-recebido para `victim`.
            // Após a correção, `_forced` já foi consumido, então este transfer
            // passa pelos checks normais (pause/freeze/compliance) e reverte
            // quando deveria — em vez de burlá-los.
            IAxiaCompliantERC721Min(target).transferFrom(address(this), victim, tokenId);
        }
        return IERC721Receiver.onERC721Received.selector;
    }
}
