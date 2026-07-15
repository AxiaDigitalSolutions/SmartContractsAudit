# TokenController — Smart Contracts Regulados (ERC-3643 / AxiaCompliantERC721)

Contratos para emissão de ativos **regulados** na Axia, reaproveitando a camada de
identidade e compliance do padrão **ERC-3643 (T-REX)**. Ver spec completa em
`Utils/docs/erc-3643-tokenization-feature.md`.

## Estrutura

```
contracts/
├── src/
│   ├── AxiaCompliantERC721.sol        # ERC-721 regulado (CUSTOM — vai para auditoria)
│   ├── interfaces/
│   │   ├── IIdentityRegistry.sol      # subset da Identity Registry T-REX
│   │   └── IModularCompliance.sol     # subset da Modular Compliance T-REX
│   └── mocks/                         # mocks só para teste — NÃO usar em produção
├── test/AxiaCompliantERC721.test.ts   # 23 testes (mint/transfer/burn/freeze/recover/pause)
├── hardhat.config.ts                  # solc 0.8.28, evmVersion cancun, optimizer 200
└── .solhint.json
```

## Comandos

```bash
npm install        # uma vez
npm run compile    # hardhat compile
npm test           # 23 testes
npm run coverage   # cobertura (AxiaCompliantERC721: 100% stmts/lines/funcs)
npm run lint       # solhint (limpo)
```

## Escopo de auditoria

**Em auditoria (custom Axia):**
- `AxiaCompliantERC721.sol` — enforcement no hook `_update` (OZ v5): mint/transfer/burn,
  freeze por endereço e por token, `forcedTransfer`/`recover` (agente), pause.
- Futuros módulos de compliance custom (lock-up de crowdfunding, jurisdição).

**Fora (já auditado pela Tokeny — reusar artefatos, não reescrever):**
- Núcleo T-REX: `Token` 3643, `IdentityRegistry`(+Storage), `TrustedIssuersRegistry`,
  `ClaimTopicsRegistry`, `ModularCompliance`, `TREXFactory`, `Identity` (ONCHAINID).

## Decisões de design marcadas para o auditor (`AUDIT:` no código)

1. **Semântica NFT→3643:** `amount` do compliance é sempre `1` por token; freeze parcial
   vira freeze por `tokenId`.
2. **`mcopy`/Cancun:** OZ v5.4 exige `evmVersion: cancun` — confirmado suportado em
   Polygon/Base (chains-alvo). Validar na chain final antes do deploy.
3. **`forcedTransfer`/`recover`** usam flag transitório `_forced` para ignorar
   pause/freeze/canTransfer, mantendo a exigência de **destino verificado**.
4. **Compliance é chamado uma vez por operação efetivada** (`created`/`transferred`/`destroyed`).

## Pendências antes de mandar para auditoria

- [ ] Fixar versão exata da suíte T-REX/ONCHAINID (fase 0) e validar assinaturas das interfaces.
- [ ] Adicionar fuzzing/invariantes (Foundry) além dos testes unitários.
- [ ] Slither/Mythril no CI.
- [ ] Confirmar com jurídico de Dubai se compliance sobre ERC-721 atende (vs 3643 fungível puro).
