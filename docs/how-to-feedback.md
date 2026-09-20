# Cách gửi feedback sau khi xong một tính năng

Ghi chú cá nhân: sau khi dùng app và có góp ý, làm gì, ở đâu, với lệnh nào.
Áp dụng cho mọi tính năng, ví dụ tính năng Notes (spec là issue #2, các ticket là #3 đến #12).

## Nguyên tắc chung

- **Nơi lưu feedback luôn là GitHub Issues** của `vihao1802/taking-book-desktop-app`, thao tác bằng `gh`. Chi tiết lệnh: `docs/agents/issue-tracker.md`.
- **Mỗi issue một việc.** Gom nhiều thứ vào một issue thì không vừa một context window của `/implement`.
- **Không sửa issue cũ đã xong** (spec hay ticket). Chúng là lịch sử. Feedback luôn là issue mới, có thể trỏ tới ticket liên quan ("liên quan #7").
- **Mỗi feedback xử lý trong một session mới** (`/clear`), không làm trong session đã dài.
- **Nếu feedback trái với `CONTEXT.md` hoặc một ADR**, không sửa thẳng code. Cập nhật tài liệu trước bằng `/grill-with-docs`, để code và tài liệu không lệch nhau.
- Các nhãn triage dùng trong repo (xem `docs/agents/triage-labels.md`): `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`.

## Chọn cách xử lý theo loại feedback

| Loại feedback | Ví dụ | Cách làm |
|---|---|---|
| Lỗi rõ ràng | "Bấm vào note mà không nhảy tới trang" | Tạo issue có cách tái hiện, `/triage` rồi `/implement #số` |
| Lỗi khó | Chỉ xảy ra thỉnh thoảng; sync mất note | `/diagnosing-bugs` |
| Chỉnh nhỏ | Đổi màu, đổi nhãn, đổi thứ tự | Tạo issue nhỏ rồi `/implement #số` |
| Đổi quyết định đã chốt | Muốn sidebar overlay thay vì đẩy trang; thêm export | `/grill-with-docs`, sau đó `/to-spec` và `/to-tickets` |
| Ý tưởng lớn mới | Một tính năng mới hoàn toàn | Bắt đầu lại main flow từ `/grill-with-docs` |
| Nhiều feedback dồn lại | Cả tuần dùng app ghi được 10 điều | Tạo từng issue rồi chạy `/triage` một lượt |

Tiền tố lệnh đầy đủ là `/mattpocock-skills:<tên>`; nếu quên tên, dùng `/mattpocock-skills:ask-matt`.

## Quy trình từng loại

### 1. Lỗi rõ ràng hoặc chỉnh nhỏ

1. Tạo issue (mẫu ở phần dưới):
   ```
   gh issue create --title "..." --label needs-triage --body "..."
   ```
2. Session mới: `/triage` để phân loại; issue đủ thông tin sẽ được gắn `ready-for-agent`, còn thiếu thì `needs-info`.
3. Session mới: `/implement #số`.
4. `/implement` tự chạy TDD từng lát, `/code-review`, chạy `npm run build`, `typecheck`, `lint`, `test` và commit.

Ghi chú: `/triage` chỉ dành cho issue do người khác tạo hoặc feedback thô. Ticket do `/to-tickets` sinh ra đã sẵn sàng cho agent, không cần triage.

### 2. Lỗi khó

Session mới: `/diagnosing-bugs` kèm mô tả ngắn. Nó không đoán nguyên nhân trước khi có **một lệnh tái hiện chắc chắn**, sửa xong thêm test hồi quy. Nếu kết luận là "không có chỗ nào tốt để khóa lỗi bằng test", nó sẽ gợi ý `/improve-codebase-architecture`.

### 3. Đổi quyết định hoặc ý tưởng mới

1. Session mới: `/grill-with-docs` kèm đoạn mô tả ý bạn muốn.
2. Nếu câu hỏi cần chạy thử mới trả lời được (nhìn giao diện, hành vi): `/handoff` ra session mới, `/prototype`, rồi `/handoff` kết quả về.
3. Chốt xong thì `/to-spec` rồi `/to-tickets` (cùng context với bước 1).
4. Mỗi ticket: `/clear` rồi `/implement #số`.

## Mẫu issue lỗi

```
## Hiện tượng
Bấm vào card note trong sidebar nhưng không nhảy tới trang.

## Cách tái hiện
1. Mở sách X ở reflow mode.
2. Tạo note ở trang 3, sang trang 20.
3. Mở Notes sidebar và bấm card note.

## Kết quả mong đợi
Nhảy tới trang 3 và flash highlight.

## Kết quả thực tế
Không có gì xảy ra.

## Môi trường
Theme (light/dark/sepia), page mode hay reflow mode, có mở Reader sidebar không.

## Liên quan
#7
```

## Trước khi tuyên bố xong một tính năng

- Review cả cụm thay đổi một lần, so với commit cố định trước ticket đầu tiên:
  ```
  /mattpocock-skills:code-review since <commit>
  ```
  Nó kiểm tra Standards (theo `AGENTS.md`) và Spec (theo issue). Với Notes, điểm cố định là `0c6e0b0`.
- Tự chạy app (`TB_DISABLE_GPU=1 npm start` khi không có GPU) và kiểm tra:
  - ba theme: light, dark, sepia;
  - page mode và reflow mode (reader có hai nhánh render riêng);
  - mở đồng thời Reader sidebar và Notes sidebar.
