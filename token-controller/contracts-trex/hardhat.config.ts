import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";

// Suíte T-REX/ONCHAINID fixa solc 0.8.17 e OZ v4. Não misturar com o unit
// custom (OZ v5 / 0.8.28) — daí o projeto Hardhat separado.

// Config de redes via env (exporte antes de rodar, NÃO commitar chave):
//   DEPLOYER_PK   = chave privada do deployer/agente (com gas na chain)
//   RPC_AMOY      = RPC da Polygon Amoy (testnet)
//   RPC_POLYGON   = RPC da Polygon mainnet
//   POLYGONSCAN_KEY = (opcional) p/ verificar contratos
const DEPLOYER_PK = process.env.DEPLOYER_PK || "";
const accounts = DEPLOYER_PK ? [DEPLOYER_PK] : [];

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.17",
    settings: {
      optimizer: { enabled: true, runs: 200 },
    },
  },
  networks: {
    amoy: {
      url: process.env.RPC_AMOY || "https://rpc-amoy.polygon.technology",
      chainId: 80002,
      accounts,
    },
    polygon: {
      url: process.env.RPC_POLYGON || "https://polygon-rpc.com",
      chainId: 137,
      accounts,
    },
  },
  etherscan: {
    apiKey: { polygon: process.env.POLYGONSCAN_KEY || "", polygonAmoy: process.env.POLYGONSCAN_KEY || "" },
  },
  paths: {
    sources: "./src",
    tests: "./test",
    cache: "./cache",
    artifacts: "./artifacts",
  },
};

export default config;
