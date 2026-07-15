// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title IModularCompliance
 * @notice Subset da Modular Compliance do T-REX. Para NFTs, `amount` é sempre 1
 *         (uma unidade por token). Os módulos plugados (lock-up, jurisdição,
 *         max-holders) operam sobre essa contagem.
 *
 * AUDIT: confirmar com a suíte T-REX usada que as assinaturas batem com a versão
 *        fixada na fase 0. `canTransfer` é view; `transferred/created/destroyed`
 *        mutam estado dos módulos e DEVEM ser chamadas só após o movimento efetivado.
 */
interface IModularCompliance {
    function canTransfer(address from, address to, uint256 amount) external view returns (bool);

    function transferred(address from, address to, uint256 amount) external;

    function created(address to, uint256 amount) external;

    function destroyed(address from, uint256 amount) external;
}
