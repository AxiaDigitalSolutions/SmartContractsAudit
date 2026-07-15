import { loadCtx, ensureIdentity } from "./lib/trex";

/**
 * Registra wallets do SISTEMA que RECEBEM tokens regulados (ex.: escrow de
 * exchange, settlement do OrderBook) como identidades verificadas na IR.
 *
 * NÃO use para TKN_OWNER — TKN_OWNER é uma entidade VIRTUAL do ledger off-chain,
 * não tem wallet on-chain. No fluxo regulado o mint vai DIRETO para a wallet do
 * investidor (identidade provisionada lazy), sem hop por TKN_OWNER.
 *
 * Rodar:  WALLETS=0xabc,0xdef COUNTRY=76 npx hardhat run scripts/register-wallets.ts --network polygon
 */
async function main() {
  const { chainId, params, agent } = await loadCtx();
  const wallets = (process.env.WALLETS || "").split(",").map((s) => s.trim()).filter(Boolean);
  const country = Number(process.env.COUNTRY || "76");

  if (!wallets.length) {
    console.log("Defina WALLETS=0x..,0x.. (wallets REAIS do sistema que recebem tokens regulados).");
    console.log("Lembre: TKN_OWNER é virtual — não registre aqui.");
    return;
  }

  console.log(`\n=== Registrando ${wallets.length} wallet(s) na IR — chain ${chainId} ===`);
  for (const w of wallets) {
    await ensureIdentity(params, agent, w, country);
    console.log(`  ✓ ${w}`);
  }
  console.log("✅ Concluído.\n");
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
