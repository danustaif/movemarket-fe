// Teks UI. Sumber utama COPY (sot/copy.en.json lewat @movemarket/shared).
import { COPY } from "@movemarket/shared";

export { COPY };

/**
 * ponytail: label struktural yang belum ada di sot/copy.en.json, diambil dari prototype hi-fi.
 * Usulan: tambahkan objek ini apa adanya sebagai `ui` di sot/copy.en.json, lalu ganti `UI` dengan `COPY.ui`
 * dan hapus objek ini. Jangan menambah teks UI di tempat lain.
 */
export const UI = {
  nav: { games: "Games", positions: "Positions", leaderboard: "Leaderboard" },
  footer: "Monad Testnet only. Test tokens have no value.",
  home: { title: "Games", replays: "Replays", watch: "Watch and predict", openMarkets: "{n} open", finished: "Finished · {result}" },
  game: {
    versus: "{white} vs {black}",
    plyMove: "Ply {ply} · move {move}",
    lastMove: "Last {san}",
    openNow: "Open now",
    inPlay: "In play",
    results: "Results",
    noOpen: "Nothing open right now. New markets open every few plies.",
    noInPlay: "Locked markets wait here for their plies.",
    noResults: "Final results from Chainlink CRE land here.",
    notFound: "This game is not being tracked.",
    back: "Back to games",
  },
  market: {
    pooled: "{amount} tUSDC pooled",
    pays: "pays {odds}",
    yourStake: "Your stake: {amount} tUSDC",
    yes: "Yes",
    no: "No",
    poolShare: "{pct}% of the pool",
  },
  stake: {
    amountLabel: "Stake",
    balance: "Balance {amount} tUSDC",
    help: "{min} to {max} tUSDC per market. {room} left in this one.",
    ifRight: "If you are right",
    feeNote: "Payout moves as others stake until the market locks.",
    cancel: "Cancel",
    sending: "Sending",
    close: "Close",
  },
  onboarding: {
    title: "Create your account",
    lede: "Use Face ID, Touch ID or your screen lock. No seed phrase, no extension. Everything runs on Monad Testnet and test tokens have no value.",
    steps: ["Create a passkey", "Receive test tokens", "Approve tUSDC once"],
    settingUp: "Setting up",
    watchFirst: "Watch the game first",
    note: "The private key is never stored; you unlock once per visit.",
    ready: "Your account is ready.",
  },
  me: {
    title: "Positions",
    balance: "Balance",
    readyToClaim: "Ready to claim",
    noAccount: "No account on this device yet.",
    noPositions: "No positions yet. Pick Yes or No on an open market and it shows up here.",
    stakeLine: "Yes {yes} · No {no} tUSDC",
    won: "Won {amount} tUSDC",
  },
  leaderboard: { title: "Leaderboard", player: "Player", profit: "Net profit", predictions: "Predictions", wins: "Wins", empty: "No settled predictions yet." },
  generic: { error: "Something went wrong.", loading: "Loading" },
} as const;

/** "Any check in {range}?" + { range } -> teks terisi. */
export function fill(t: string, vars: Record<string, string | number>): string {
  return t.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m));
}
