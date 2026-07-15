# TokenController — Suíte ERC-3643 (T-REX/Tokeny + ONCHAINID)

Unit de compilação/integração da **suíte ERC-3643 de referência** (fungível regulado),
usada nas ofertas de **Crowdfunding/CreditCore** marcadas como `regulated`. Ver spec em
`Utils/docs/erc-3643-tokenization-feature.md`.

## Por que um projeto Hardhat separado do `contracts/`

T-REX 4.1.6 e ONCHAINID 2.2.1 fixam **solc 0.8.17 + OpenZeppelin v4**. O unit custom
(`../contracts/`, `AxiaCompliantERC721`) usa **OZ v5 / solc 0.8.28**. As duas versões do
pacote `@openzeppelin/contracts` não coexistem num único projeto Hardhat (sem remapping),
então a suíte 3643 fica isolada aqui. **Eles se conectam on-chain por endereço/interface,
nunca em tempo de compilação** — daí a separação ser limpa, não um problema.

## Princípio: reuso, não reescrita

Todos os contratos aqui são **auditados pela Tokeny/ONCHAINID** e consumidos como
dependência (`Imports.sol` só força o Hardhat a gerar os artifacts). **Não reescrevemos o
núcleo ERC-3643** — o jurídico de Dubai pediu o padrão, e a implementação de referência é
a da Tokeny. A Tokeny ainda entrega o `TREXGateway.sol` (deploy controlado com roles), o
que dispensa um gateway custom.

## Comandos

```bash
npm install
npm run compile   # 73 arquivos (suíte T-REX + ONCHAINID + módulos de compliance)
npm test          # 5 testes de integração ponta a ponta
```

## O que o teste de integração prova (`test/Erc3643Integration.test.ts`)

Fluxo real, sem mocks da suíte:

1. **Deploy da suíte** via `TREXFactory.deployTREXSuite` (token + IR + IRS + TIR + CTR + MC),
   com `TREXImplementationAuthority` e `IdFactory` (ONCHAINID).
2. **Identidade on-chain:** `IdFactory.createIdentity` cria o ONCHAINID do investidor.
3. **Claim KYC:** a Axia (ClaimIssuer = trusted issuer, chave purpose 3) assina o claim; o
   investidor o adiciona ao seu ONCHAINID; `IdentityRegistry.isVerified` passa a `true`.
4. **Mint:** funciona para investidor verificado, **reverte** (`Identity is not verified.`)
   para não verificado.
5. **Transfer:** entre verificados ok; **reverte** (`Transfer not possible`) para destino
   sem KYC.
6. **Freeze:** `setAddressFrozen` bloqueia transferência (`wallet is frozen`).

Este é o mesmo modelo que o `IdentityProvisioningService` (lazy/JIT) vai orquestrar do lado
do backend, puxando o KYC do CPM no momento do mint.

## Próximos passos

- [ ] Fixar este fluxo num **script de deploy** reutilizável (mainnet/testnet Polygon).
- [ ] Mapear `assets.block_resell`/lock-up de crowdfunding para **módulos de compliance**
      (`CountryAllowModule`, `MaxBalanceModule`, `SupplyLimitModule` já compilados, ou módulo
      custom de lock-up — este último entra no escopo de auditoria do unit `contracts/`).
- [ ] Bootstrap deploy-once dos registries compartilhados + registro da malha custodial.
