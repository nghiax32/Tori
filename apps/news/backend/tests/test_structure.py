from news.structure import refang, structure

DAILY = """🕗 Cập nhật lúc 19:40 (UTC+7, giờ Việt Nam) · Tin trong 12 giờ qua

## Top 3 tin đáng chú ý

**1. Hormuz nóng lên.** Ba tàu trúng thủy lôi.

## 🌍 Thế giới

**EU khám xét tàu** — Lực lượng EU lên tàu. [Euronews](https[://]www[.]euronews[.]com/a) · [Kyiv Independent](https://kyivindependent.com/b)

**Iran ngừng đàm phán với IAEA.** Theo một báo cáo mật. — [AP News](https://apnews.com/x)

---

## 💹 Kinh tế & Thị trường

Hôm nay là Chủ Nhật.

- **Mỹ:** S&P 500 7.561,67 (−0,4%)

Nguồn: [TipRanks](https://www.tipranks.com/x) · [Rio](https://riotimesonline.com/y)

## 📅 Đáng theo dõi tối nay / ngày mai

- **06:00 thứ Hai 16/11:** hợp đồng tương lai Mỹ mở lại.
- **18–19/11:** APEC tại Thâm Quyến.

**Sources:**
- [Anadolu – Morning Briefing](https://www.aa.com.tr/x)
- [Lạ](javascript:alert(1))
"""

WEEKLY = """🕗 Cập nhật lúc 20:04, Chủ Nhật 15/11/2026 (UTC+7, giờ Việt Nam)

## Châu Á & Việt Nam

**VN-Index tăng nhẹ** — 09–13/11
VN-Index đóng cửa ở 1.734,93 điểm. [Thanh Tra](https://thanhtra.com.vn/x)

## Thị trường trong tuần (09–13/11)

| Tài sản | Thay đổi tuần |
|---|---|
| S&P 500 | +2,5% |

## Sources:
- [AP qua PBS – Đàm phán](https://www.pbs.org/x)
"""


def test_daily_sections_and_items():
    st = structure(DAILY)
    assert st["updated"].startswith("Cập nhật lúc 19:40")
    kinds = [(s["kind"], s["tone"], s["title"]) for s in st["sections"]]
    assert kinds == [
        ("top", None, "Top 3 tin đáng chú ý"),
        ("category", "world", "Thế giới"),
        ("category", "economy", "Kinh tế & Thị trường"),
        ("timeline", None, "Đáng theo dõi tối nay / ngày mai"),
        ("sources", None, "Nguồn"),  # "Sources:" cuối mục cuối -> mục riêng
    ]
    top = st["sections"][0]["blocks"][0]
    assert (top["num"], top["title_html"], top["body_html"]) == (1, "Hormuz nóng lên", "Ba tàu trúng thủy lôi.")

    world = st["sections"][1]
    assert world["icon"] == "🌍"
    first, second = world["blocks"]  # đường kẻ "---" bị bỏ
    assert first["title_html"] == "EU khám xét tàu" and first["body_html"] == "Lực lượng EU lên tàu."
    # link bị viết "https[://]www[.]..." được trả lại thành link thường
    assert [s["url"] for s in first["sources"]] == ["https://www.euronews.com/a", "https://kyivindependent.com/b"]
    # khuôn "**Tiêu đề.** nội dung — [Nguồn](url)"
    assert second["title_html"] == "Iran ngừng đàm phán với IAEA"
    assert second["body_html"] == "Theo một báo cáo mật."
    assert second["sources"] == [{"name": "AP News", "url": "https://apnews.com/x"}]

    economy = [b["type"] for b in st["sections"][2]["blocks"]]
    assert economy == ["html", "html", "sources_inline"]  # đoạn không khớp khuôn vẫn giữ dạng HTML

    timeline = st["sections"][3]["blocks"][0]["entries"]
    assert [e["when"] for e in timeline] == ["06:00 thứ Hai 16/11", "18–19/11"]
    assert timeline[1]["html"] == "APEC tại Thâm Quyến."

    links = st["sections"][4]["blocks"][0]["links"]
    assert links == [{"name": "Anadolu – Morning Briefing", "url": "https://www.aa.com.tr/x"}]  # bỏ link javascript:


def test_weekly_meta_table_and_sources_heading():
    st = structure(WEEKLY)
    asia, table, sources = st["sections"]
    item = asia["blocks"][0]
    assert (asia["tone"], item["meta"], item["body_html"]) == ("asia", "09–13/11", "VN-Index đóng cửa ở 1.734,93 điểm.")
    assert table["kind"] == "table" and "<table>" in table["blocks"][0]["html"]
    assert sources["kind"] == "sources" and sources["blocks"][0]["links"][0]["url"] == "https://www.pbs.org/x"


def test_inline_html_is_escaped():
    st = structure("## Thế giới\n\n**<b>Tiêu đề</b>** — <script>x</script> [x](javascript:alert(1))")
    item = st["sections"][0]["blocks"][0]
    assert "<b>" not in item["title_html"] and "<script>" not in item["body_html"]
    assert 'href="javascript' not in item["body_html"]


def test_tech_bulletin_tones():
    st = structure("## 🛡️ Bảo mật\n\nKhông có tin nổi bật.\n\n## 💻 Lập trình & Mã nguồn mở\n\nKhông có tin nổi bật.")
    assert [s["tone"] for s in st["sections"]] == ["security", "dev"]


def test_no_sections_falls_back():
    assert structure("Chỉ có một đoạn chữ.") is None
    assert refang("https[://]a[.]b[.]com") == "https://a.b.com"
