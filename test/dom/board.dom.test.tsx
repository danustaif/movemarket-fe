import { describe, expect, test } from "bun:test";
import { render, screen } from "@testing-library/react";
import { UI, fill } from "../../src/components/common/copy.ts";
import { LiveBoard } from "../../src/components/board/LiveBoard.tsx";
import { GameListItem } from "../../src/components/game/GameListItem.tsx";
import { game, renderInRouter } from "./helpers.tsx";

const FEN = "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1";

/** Elemen yang bisa difokus keyboard. aria-hidden tidak mencegah fokus; hanya inert (atau tabindex=-1) yang mencegah. */
const reachable = (root: Element) =>
  [...root.querySelectorAll("a[href], button, input, [tabindex]")].filter(
    (el) => el.getAttribute("tabindex") !== "-1" && !el.closest("[inert]"),
  );

describe("display-only boards", () => {
  test("LiveBoard is one named image; its pieces are not focusable controls", () => {
    render(<LiveBoard fen={FEN} ply={1} isReplay={false} />);
    const board = screen.getByRole("img", { name: fill(UI.game.plyMove, { ply: 1, move: 1 }) });
    expect(reachable(board).map((el) => el.outerHTML.slice(0, 80))).toEqual([]);
  });

  test("home mini board adds no focus stops besides the Watch link", async () => {
    renderInRouter(<GameListItem game={game([]).game} />);
    const item = await screen.findByRole("article");
    expect(reachable(item).map((el) => el.textContent)).toEqual([UI.home.watch]);
  });
});
