// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title IIdentityRegistry
 * @notice Subset da Identity Registry do T-REX consumido pelos contratos Axia.
 *         A registry compartilhada (deploy-once por chain) é a oficial da Tokeny;
 *         esta interface existe só para tipar a integração custom.
 */
interface IIdentityRegistry {
    /// @notice Indica se a wallet está apta a receber/transferir tokens regulados.
    /// @param account Wallet a consultar.
    /// @return true se a wallet tem ONCHAINID registrado e claims válidos.
    function isVerified(address account) external view returns (bool);

    /// @notice Resolve o contrato ONCHAINID vinculado a uma wallet.
    /// @param account Wallet a consultar.
    /// @return endereço do contrato ONCHAINID vinculado à wallet (address(0) se nenhum).
    function identity(address account) external view returns (address);

    /// @notice País do investidor registrado para a wallet.
    /// @param account Wallet a consultar.
    /// @return código de país (ISO 3166-1 numérico) registrado para a wallet.
    function investorCountry(address account) external view returns (uint16);
}
