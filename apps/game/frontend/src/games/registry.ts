/** Danh sách game. Mỗi game là một module riêng, chỉ tải khi được mở (Vite tách thành file riêng). */
export interface GameModule {
  /** Vẽ game vào `el`; trả về hàm dọn dẹp (dừng đồng hồ, gỡ phím tắt...) khi rời game. */
  mount(el: HTMLElement): () => void;
}

export interface GameInfo {
  id: string;
  name: string;
  icon: string;
  description: string;
  load: () => Promise<GameModule>;
}

export const GAMES: GameInfo[] = [
  {
    id: "sudoku",
    name: "Sudoku",
    icon: "🔢",
    description: "Điền số 1–9 sao cho mỗi hàng, cột và khối 3×3 không trùng số. Ba mức khó, bảng xếp hạng giải nhanh nhất.",
    load: () => import("./sudoku"),
  },
  {
    id: "o-an-quan",
    name: "Ô ăn quan",
    icon: "🪨",
    description: "Trò chơi dân gian: rải dân, ăn quan, đấu với máy ở ba mức Dễ, Vừa, Khó. Một quan bằng 10 dân, nhiều điểm hơn thì thắng.",
    load: () => import("./o-an-quan"),
  },
];
