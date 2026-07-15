# Axia — Smart Contracts (Auditoria)

Repositório com o código-fonte dos smart contracts da **Axia Digital Solutions** enviados
para auditoria externa, no contexto dos projetos de tokenização regulada (incluindo a
iniciativa **Fractur** — tokenização white-label de ativos reais / imóveis em Dubai).

O objetivo deste repositório é reunir, de forma isolada e reproduzível, apenas os contratos
e o material necessário para revisão de segurança. O relatório de auditoria será adicionado
em [`audit/`](audit/) quando entregue.

---

## Escopo da auditoria

O núcleo **ERC-3643 (T-REX / Tokeny)** e o **ONCHAINID** já são auditados pela Tokeny e são
consumidos como dependência — **não reescrevemos esse núcleo**. O escopo de revisão custom
da Axia são os contratos abaixo:

| Contrato | Padrão | solc | Escopo | Descrição |
|---|---|---|---|---|
| [`AxiaCompliantERC721.sol`](token-controller/contracts/src/AxiaCompliantERC721.sol) | ERC-721 regulado | ^0.8.27 (OZ v5) | **Em auditoria (custom)** | NFT regulado que injeta a camada de identidade/compliance do ERC-3643 no hook `_update`: mint/transfer/burn, freeze por endereço e por token, `forcedTransfer`/`recover` (agente), pause. |
| [`WhitelabelNFTBurnable.sol`](token-controller/contracts/src/WhitelabelNFTBurnable.sol) | ERC-721 + Burnable | ^0.8.27 (OZ v5) | **Em auditoria (custom)** | NFT white-label com queima controlada por role. |
| [`ERC20TrancheToken.sol`](credit-core/contracts/ERC20TrancheToken.sol) | ERC-20 | ^0.8.0 | **Em auditoria (custom)** | Posições de investidor em tranches/deals de crédito. Mint/burn por role, pausável, whitelist e restrições de transferência. |
| [`ERC1155ReceivableToken.sol`](credit-core/contracts/ERC1155ReceivableToken.sol) | ERC-1155 | ^0.8.0 | **Em auditoria (custom)** | Um token por recebível/cobrança (`tokenId` = id do recebível). Mint/burn por role, pausável, metadata IPFS, whitelist. |
| [`Imports.sol`](token-controller/contracts-trex/src/Imports.sol) | ERC-3643 (T-REX) | 0.8.17 (OZ v4) | **Fora — reuso Tokeny** | Apenas força o Hardhat a compilar a suíte de referência para os testes de integração. O núcleo 3643/ONCHAINID **não** é código Axia. |
| [`legacy-sol/whitelabel.sol`](token-controller/legacy-sol/whitelabel.sol) | ERC-721 (legado) | 0.5.1 | Referência histórica | Contrato NFT legado em produção. Incluído para contexto; não é o alvo principal da nova auditoria. |

Interfaces (`IIdentityRegistry`, `IModularCompliance`) são subsets das interfaces T-REX; os
`mocks/` existem **apenas para teste** e não vão para produção.

### Por que o código-fonte ERC-3643 não está versionado aqui

O núcleo ERC-3643 (T-REX + ONCHAINID) **não é vendorizado** neste repositório de propósito.
Ele é código de terceiros, **já auditado pela Tokeny**, e é consumido como dependência npm
em **versões pinadas exatas**:

| Pacote | Versão | Compilador |
|---|---|---|
| `@tokenysolutions/t-rex` | `4.1.6` | solc 0.8.17 |
| `@onchain-id/solidity` | `2.2.1` | solc 0.8.17 |
| `@openzeppelin/contracts` | `4.9.6` | — |
| `@openzeppelin/contracts-upgradeable` | `4.9.6` | — |

O [`Imports.sol`](token-controller/contracts-trex/src/Imports.sol) apenas referencia esses
pacotes para forçar o Hardhat a gerar os artifacts. Como as versões estão travadas no
[`package-lock.json`](token-controller/contracts-trex/package-lock.json), um `npm install`
reproduz **exatamente o mesmo bytecode** que roda em produção — sem ambiguidade e sem
necessidade de reauditar código de terceiros.

> Se a auditoria exigir uma árvore **auto-contida** (fonte T-REX/ONCHAINID fisicamente no
> repositório, sem depender do npm registry), o fonte pode ser vendorizado em
> `token-controller/contracts-trex/vendor/`. Basta solicitar.

---

## Estrutura do repositório

```
.
├── token-controller/              # Projeto principal (Fractur / ERC-3643)
│   ├── contracts/                 # ← EM AUDITORIA: AxiaCompliantERC721 + WhitelabelNFTBurnable (OZ v5, solc 0.8.28)
│   │   ├── src/
│   │   │   ├── AxiaCompliantERC721.sol
│   │   │   ├── WhitelabelNFTBurnable.sol
│   │   │   ├── interfaces/         # subsets das interfaces T-REX
│   │   │   └── mocks/              # apenas para teste
│   │   ├── test/                  # testes unitários (Hardhat + TS)
│   │   ├── hardhat.config.ts
│   │   └── .solhint.json
│   ├── contracts-trex/            # Suíte ERC-3643 de referência (Tokeny) — integração/reuso (solc 0.8.17)
│   │   ├── src/Imports.sol
│   │   ├── scripts/               # deploy-suite / verify-suite / register-wallets
│   │   ├── test/                  # teste de integração ponta a ponta
│   │   └── DEPLOY.md
│   └── legacy-sol/whitelabel.sol  # NFT legado (solc 0.5.1)
├── credit-core/                   # Tokenização de crédito/recebíveis (CreditCore)
│   └── contracts/                 # ERC20TrancheToken + ERC1155ReceivableToken
└── audit/                         # Relatório de auditoria (a ser adicionado)
```

> **Nota sobre a separação `contracts/` vs `contracts-trex/`:** a suíte T-REX 4.1.6 +
> ONCHAINID 2.2.1 fixa **solc 0.8.17 + OpenZeppelin v4**, enquanto os contratos custom usam
> **OZ v5 / solc 0.8.28**. As duas versões de `@openzeppelin/contracts` não coexistem num
> único projeto Hardhat, então a suíte 3643 fica isolada. Os dois lados se conectam
> **on-chain por endereço/interface**, nunca em tempo de compilação.

---

## Como compilar e testar

Cada projeto Hardhat é independente. Em cada pasta:

```bash
npm install
npm run compile
npm test
```

- **`token-controller/contracts`** — `npm run compile`, `npm test`, `npm run coverage`,
  `npm run lint` (solhint). Ver [README do módulo](token-controller/contracts/README.md).
- **`token-controller/contracts-trex`** — `npm run compile`, `npm test` (integração ERC-3643
  ponta a ponta). Deploy: ver [DEPLOY.md](token-controller/contracts-trex/DEPLOY.md).
- **`credit-core`** — ver [README do módulo](credit-core/README.md).

> **Segredos:** copie `.env.example` para `.env.local` e exporte suas próprias chaves/RPCs
> antes de rodar deploys. **Nenhuma chave privada real é versionada neste repositório.**

---

## Relatório de auditoria

O relatório será publicado em [`audit/`](audit/) assim que entregue pelo auditor.

---

© 2026 Axia Digital Solutions — Licença [MIT](LICENSE).
