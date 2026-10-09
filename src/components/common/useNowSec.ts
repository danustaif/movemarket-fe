import { useEffect, useState } from "react";

/** Detik waktu chain yang berdetak tiap 500 ms. `offsetSec` dari useChainTime (chain - lokal). */
export function useNowSec(offsetSec = 0): number {
  const [local, setLocal] = useState(() => Date.now() / 1000);
  useEffect(() => {
    const t = setInterval(() => setLocal(Date.now() / 1000), 500);
    return () => clearInterval(t);
  }, []);
  return local + offsetSec;
}
