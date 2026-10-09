// Tautan explorer untuk tx report CRE (DESIGN.md: "Final: Yes/No with CRE transaction link").
import { SOT } from "@movemarket/shared";
import type { Hex } from "viem";
import { UI, fill } from "./copy.ts";
import { shortAddr } from "./format.ts";

export const txUrl = (hash: Hex) => `${SOT.network.explorer}/tx/${hash}`;

export function TxLink({ hash, className = "" }: { hash: Hex; className?: string }) {
  return (
    <a href={txUrl(hash)} target="_blank" rel="noopener noreferrer" className={`text-sm font-bold text-gold underline underline-offset-2 ${className}`}>
      {fill(UI.market.finalTx, { tx: shortAddr(hash) })}
    </a>
  );
}
