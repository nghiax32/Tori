"""Sinh đề Sudoku 9x9 có đúng một lời giải.

Bàn cờ là chuỗi 81 ký tự theo hàng, "0" là ô trống.
"""

import random

# Số ô cho sẵn mục tiêu theo mức khó (đề khó có thể còn vài ô hơn nếu bỏ thêm sẽ mất tính duy nhất)
LEVELS = {"easy": 38, "medium": 30, "hard": 25}

_ROW = [i // 9 for i in range(81)]
_COL = [i % 9 for i in range(81)]
_BOX = [(i // 27) * 3 + (i % 9) // 3 for i in range(81)]
_ALL = 0b1111111110  # bit 1..9


def _search(grid: list[int], limit: int, rng: random.Random | None = None, out: list[int] | None = None) -> int:
    """Đếm số lời giải của `grid` (dừng khi đạt `limit`). `out` nhận lời giải đầu tiên.
    `rng` có thì thử chữ số theo thứ tự ngẫu nhiên (dùng để sinh bàn cờ đầy)."""
    rows, cols, boxes = [0] * 9, [0] * 9, [0] * 9
    for i, v in enumerate(grid):
        if v:
            bit = 1 << v
            if (rows[_ROW[i]] | cols[_COL[i]] | boxes[_BOX[i]]) & bit:
                return 0
            rows[_ROW[i]] |= bit
            cols[_COL[i]] |= bit
            boxes[_BOX[i]] |= bit
    empties = [i for i, v in enumerate(grid) if not v]
    count = 0

    def rec() -> bool:
        nonlocal count
        best, best_mask, best_n = -1, 0, 10
        for i in empties:
            if grid[i]:
                continue
            mask = _ALL & ~(rows[_ROW[i]] | cols[_COL[i]] | boxes[_BOX[i]])
            n = mask.bit_count()
            if n < best_n:
                best, best_mask, best_n = i, mask, n
                if n <= 1:
                    break
        if best < 0:
            count += 1
            if out is not None and not out:
                out.extend(grid)
            return count >= limit
        if best_n == 0:
            return False
        digits = [d for d in range(1, 10) if best_mask >> d & 1]
        if rng:
            rng.shuffle(digits)
        r, c, b = _ROW[best], _COL[best], _BOX[best]
        for d in digits:
            bit = 1 << d
            grid[best] = d
            rows[r] |= bit
            cols[c] |= bit
            boxes[b] |= bit
            done = rec()
            grid[best] = 0
            rows[r] &= ~bit
            cols[c] &= ~bit
            boxes[b] &= ~bit
            if done:
                return True
        return False

    rec()
    return count


def count_solutions(board: str, limit: int = 2) -> int:
    return _search([int(c) for c in board], limit)


def generate(level: str, rng: random.Random | None = None) -> tuple[str, str]:
    """Trả về (đề, lời giải). Thử vài lần, lấy đề ít ô cho sẵn nhất (đề khó đôi khi không bỏ được tới mục tiêu)."""
    rng = rng or random.Random()
    best = _generate_once(level, rng)
    for _ in range(9):
        if 81 - best[0].count("0") <= LEVELS[level]:
            break
        best = min(best, _generate_once(level, rng), key=lambda x: 81 - x[0].count("0"))
    return best


def _generate_once(level: str, rng: random.Random) -> tuple[str, str]:
    solution: list[int] = []
    _search([0] * 81, 1, rng, solution)
    puzzle = list(solution)
    givens = 81
    cells = list(range(81))
    rng.shuffle(cells)
    for i in cells:
        if givens <= LEVELS[level]:
            break
        puzzle[i] = 0
        if _search(list(puzzle), 2) == 1:
            givens -= 1
        else:
            puzzle[i] = solution[i]
    return "".join(map(str, puzzle)), "".join(map(str, solution))
