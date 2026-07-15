// SPDX-License-Identifier: MIT
pragma solidity 0.8.17;

/**
 * @title Imports
 * @notice Não é um contrato de produção — apenas força o Hardhat a compilar a
 *         suíte ERC-3643 (T-REX/Tokeny) e ONCHAINID, gerando os artifacts que os
 *         testes/scripts de deploy consomem via getContractFactory.
 *
 *         Tudo aqui é AUDITADO PELA TOKENY — reusado, não reescrito.
 */

// Implementações T-REX
import "@tokenysolutions/t-rex/contracts/token/Token.sol";
import "@tokenysolutions/t-rex/contracts/registry/implementation/ClaimTopicsRegistry.sol";
import "@tokenysolutions/t-rex/contracts/registry/implementation/IdentityRegistry.sol";
import "@tokenysolutions/t-rex/contracts/registry/implementation/IdentityRegistryStorage.sol";
import "@tokenysolutions/t-rex/contracts/registry/implementation/TrustedIssuersRegistry.sol";
import "@tokenysolutions/t-rex/contracts/compliance/modular/ModularCompliance.sol";

// Proxies
import "@tokenysolutions/t-rex/contracts/proxy/TokenProxy.sol";
import "@tokenysolutions/t-rex/contracts/proxy/ClaimTopicsRegistryProxy.sol";
import "@tokenysolutions/t-rex/contracts/proxy/IdentityRegistryProxy.sol";
import "@tokenysolutions/t-rex/contracts/proxy/IdentityRegistryStorageProxy.sol";
import "@tokenysolutions/t-rex/contracts/proxy/ModularComplianceProxy.sol";
import "@tokenysolutions/t-rex/contracts/proxy/TrustedIssuersRegistryProxy.sol";

// Factory + Implementation Authority + Gateway (deploy controlado pela Tokeny)
import "@tokenysolutions/t-rex/contracts/factory/TREXFactory.sol";
import "@tokenysolutions/t-rex/contracts/factory/TREXGateway.sol";
import "@tokenysolutions/t-rex/contracts/proxy/authority/TREXImplementationAuthority.sol";
import "@tokenysolutions/t-rex/contracts/proxy/authority/IAFactory.sol";

// Módulos de compliance prontos (reuso — lock-up/jurisdição/limites)
import "@tokenysolutions/t-rex/contracts/compliance/modular/modules/CountryAllowModule.sol";
import "@tokenysolutions/t-rex/contracts/compliance/modular/modules/MaxBalanceModule.sol";
import "@tokenysolutions/t-rex/contracts/compliance/modular/modules/SupplyLimitModule.sol";

// ONCHAINID — identidade on-chain (ERC-734/735) + factory + claim issuer
import "@onchain-id/solidity/contracts/Identity.sol";
import "@onchain-id/solidity/contracts/ClaimIssuer.sol";
import "@onchain-id/solidity/contracts/factory/IdFactory.sol";
import "@onchain-id/solidity/contracts/proxy/ImplementationAuthority.sol";

contract Imports {
// solhint-disable-previous-line no-empty-blocks
}
