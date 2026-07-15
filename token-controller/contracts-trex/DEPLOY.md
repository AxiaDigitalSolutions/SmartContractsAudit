# Runbook — Deploy da suíte ERC-3643 nas redes

Há **dois níveis de deploy**. Não confunda.

| Nível | O quê | Quando | Quem |
|---|---|---|---|
| **1. Infra (bootstrap)** | Suíte T-REX compartilhada da chain: implementations, ImplementationAuthority, ONCHAINID IdFactory, TREXFactory, ClaimIssuer (Axia), registries (IR/IRS/TIR/CTR), ModularCompliance | **Uma vez por chain** (deploy-once) | **Ops/DevOps**, via este projeto Hardhat |
| **2. Por oferta (token/coleção)** | O contrato do ativo (Token 3643 fungível ou AxiaCompliantERC721) | **Automático** ao ativar/encerrar o crowdfunding | **Backend** (TokenController/FMS) via TREXFactory |

O nível 2 **só funciona depois** do nível 1 + `trexParameters` no secret manager.

---

## Nível 1 — Bootstrap (ops, por chain)

### Pré
- [ ] Wallet de deploy com **gas** na chain (MATIC na Polygon).
- [ ] RPC da chain (Alchemy/Infura/público).
- [ ] `npm install` em `contracts-trex/`.

### Passos
```bash
cd Eniato/Backend/TokenController/packages/processor/contracts-trex

# 1. Configurar env (não commitar)
cp .env.example .env.local
# edite DEPLOYER_PK, RPC_*
export $(grep -v '^#' .env.local | xargs)

# 2. (dry-run) validar local primeiro
npx hardhat run scripts/deploy-suite.ts

# 3. Deploy na TESTNET (Amoy)
npx hardhat run scripts/deploy-suite.ts --network amoy

# 4. Deploy na MAINNET (Polygon) — após validar tudo
npx hardhat run scripts/deploy-suite.ts --network polygon
```

### Saída
O script imprime o bloco `trexParameters` da chain, ex.:
```json
{ "137": {
  "idFactoryAddress": "0x...",
  "identityRegistryAddress": "0x...",
  "identityStorageAddress": "0x...",
  "claimIssuerAddress": "0x...",
  "trexFactoryAddress": "0x...",
  "complianceAddress": "0x...",
  "kycClaimTopic": "1",
  "agentPrivateKey": "<<PREENCHER>>",
  "claimSigningKey": "<<PREENCHER>>"
}}
```

### Pós-deploy (obrigatório)
1. **Secret manager** — colar o `trexParameters` (keyed por chainId) na config dos serviços **CPM, FMS e TokenController**. Preencher `agentPrivateKey` (= o DEPLOYER_PK, owner do IdFactory + agente do IR) e `claimSigningKey` (a chave purpose-3 que assina KYC; pode ser a mesma).
2. **Malha custodial** — registrar `TKN_OWNER` e as sink wallets como identidades institucionais na IdentityRegistry (senão mint/transfer custodial reverte). Pode ser via uma chamada `ensureVerifiedIdentity` administrativa por wallet, ou um script de bootstrap dedicado.
3. **Gestão de chave** — em produção, a `agentPrivateKey`/`claimSigningKey` deve viver em KMS/HSM, não em texto plano. Quem assina claims = quem pode forjar KYC.
4. (opcional) **Verificar** contratos no Polygonscan (`POLYGONSCAN_KEY`).

> **Repetir por chain.** Cada chain EVM nova = rodar o script + adicionar sua entrada no `trexParameters`.

---

## Nível 2 — Deploy por oferta (automático)

Nada manual. Quando um crowdfunding regulado é **ativado** (status `active`) com a tokenização configurada, o `controlCrowdfunding.scheduler` chama `generateNFTs`, que:
- **Fungível ERC3643:** `FMS.createTokens` → o scheduler de deploy do FMS chama `TREXFactory.deployTREXSuite` (lê `trexParameters` da chain) → token regulado deployado reusando o IRS compartilhado.
- **NFT ERC721_COMPLIANT:** TokenController (`actions.tools`) deploya o `AxiaCompliantERC721` apontando para a IR/Compliance compartilhadas.

Pré pro nível 2 funcionar:
- [ ] Nível 1 feito na chain.
- [ ] `trexParameters` da chain no secret manager (FMS + TokenController + CPM).
- [ ] A wallet `mainWalletParameter`/`mnemonicParameter` (que paga gas dos deploys/mints) com saldo na chain.
- [ ] Investidores com KYC APPROVED (o provisionamento de identidade é lazy no mint, via CPM).

---

## Troubleshooting
- `No ERC-3643 suite configured for chain X` → falta a entrada `trexParameters[X]` no secret manager.
- Mint reverte `receiver not verified` → identidade do investidor não provisionada (KYC não APPROVED, ou malha custodial não registrada).
- Deploy sem gas → financiar a wallet de deploy/agente na chain.
