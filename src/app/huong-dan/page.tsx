import Image from "next/image";
import type { Metadata } from "next";
import { Be_Vietnam_Pro } from "next/font/google";
import PrintButton from "./PrintButton";

// Be Vietnam Pro is drawn for Vietnamese: every tone mark sits correctly, in every weight used here (and in the
// PDF printed from this page). The default fonts synthesize bold and misplace stacked diacritics.
const guideFont = Be_Vietnam_Pro({ subsets: ["vietnamese", "latin"], weight: ["400", "500", "600", "700", "800"], display: "swap" });

export const metadata: Metadata = {
  title: "Hướng dẫn đặt cơm trưa cho cán bộ",
  description: "Cách đăng ký, hủy và nhận cơm trưa dành cho cán bộ, viên chức tại HMU THC Canteen.",
};

const SITE_URL = "https://hmu-canteen.onrender.com";

// A public page (no login needed) so it can be sent to staff before they have signed in once.
// It deliberately does not state the initial password.

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <section className="break-inside-avoid rounded-2xl border border-slate-200 bg-white p-5 shadow-sm print:shadow-none">
      <h2 className="flex items-center gap-3 text-lg font-bold text-slate-800">
        <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-red-600 text-sm text-white">
          {n}
        </span>
        {title}
      </h2>
      <div className="mt-3 space-y-2 text-sm leading-relaxed text-slate-700">{children}</div>
    </section>
  );
}

// A static copy of the day tiles on the ordering page, so the guide shows what the officer will see.
function Tile({ day, date, on, label }: { day: string; date: string; on: boolean; label: string }) {
  return (
    <div
      className={`relative rounded-2xl border-2 p-3 text-left ${
        on ? "border-red-600 bg-red-600 text-white shadow-md" : "border-slate-200 bg-white"
      }`}
    >
      {on && (
        <span className="absolute right-2 top-2 flex h-5 w-5 items-center justify-center rounded-full bg-white text-xs font-bold text-red-600">
          ✓
        </span>
      )}
      <p className={`text-xs ${on ? "text-red-100" : "text-slate-500"}`}>{day}</p>
      <p className={`text-lg font-bold ${on ? "text-white" : "text-slate-800"}`}>{date}</p>
      <p className={`mt-1 text-xs font-semibold ${on ? "text-white" : "text-slate-400"}`}>{label}</p>
    </div>
  );
}

function Key({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-md border border-slate-300 bg-slate-50 px-1.5 py-0.5 text-xs font-semibold text-slate-700">
      {children}
    </span>
  );
}

export default function GuidePage() {
  return (
    <main className={`${guideFont.className} mx-auto max-w-3xl space-y-5 px-4 py-8 [-webkit-print-color-adjust:exact] [print-color-adjust:exact] print:py-0`}>
      {/* Vietnamese paper: A4 with even margins when printed or saved as PDF. */}
      <style>{`@page { size: A4; margin: 12mm; }`}</style>
      <header className="text-center">
        <Image
          src="/logo.webp"
          alt="Đại học Y Hà Nội - Phân hiệu Thanh Hóa"
          width={96}
          height={96}
          priority
          className="mx-auto mb-3 h-20 w-20 rounded-full bg-white object-cover"
        />
        <p className="text-sm font-semibold uppercase tracking-widest text-red-600">HMU THC Canteen</p>
        <h1 className="mt-1 text-2xl font-extrabold text-slate-800 sm:text-3xl">Hướng dẫn đặt cơm trưa dành cho cán bộ</h1>
        <div className="mt-4 print:hidden">
          <PrintButton />
        </div>
      </header>

      <section className="break-inside-avoid rounded-2xl border border-slate-200 bg-white p-4 text-center shadow-sm print:shadow-none">
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Địa chỉ truy cập</p>
        <a href={SITE_URL} className="mt-1 block text-xl font-extrabold text-red-600 underline decoration-red-300 underline-offset-4 sm:text-2xl">
          hmu-canteen.onrender.com
        </a>
        <p className="mt-1 text-xs text-slate-500">Dùng được trên điện thoại và máy tính. Bấm vào địa chỉ để mở trang đăng nhập.</p>
      </section>

      <section className="break-inside-avoid rounded-2xl border-2 border-red-200 bg-red-50 p-5">
        <h2 className="text-base font-bold text-red-700">Cần nhớ</h2>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-700">
          <li>
            Chỉ đặt <b>cơm trưa</b>, các ngày <b>thứ 2 đến thứ 6</b>.
          </li>
          <li>
            Phải đăng ký <b>trước hết ngày thứ 6 của tuần trước đó</b>.
          </li>
          <li>
            Muốn hủy một ngày: hủy <b>trước 9h00 sáng của chính ngày đó</b>.
          </li>
          <li>
            Khi nhận cơm, <b>ký tên</b> vào danh sách của căng tin. Không cần bấm gì trên web.
          </li>
        </ul>
      </section>

      <Step n={1} title="Đăng nhập">
        <p>
          Mở trang web của căng tin tại{" "}
          <a href={SITE_URL} className="font-semibold text-red-600 underline">
            hmu-canteen.onrender.com
          </a>{" "}
          trên điện thoại hoặc máy tính, rồi nhập:
        </p>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            <b>Số điện thoại / Mã cán bộ</b>: dùng <b>mã cán bộ</b> của bạn, hoặc số điện thoại đã đăng ký. Gõ chữ hoa
            hay chữ thường đều được.
          </li>
          <li>
            <b>Mật khẩu</b>: mật khẩu ban đầu do quản trị viên thông báo riêng cho bạn.
          </li>
        </ul>
        <p>
          Lần đầu đăng nhập, hệ thống yêu cầu <b>đổi mật khẩu mới</b>. Hãy đặt mật khẩu mà bạn dễ nhớ, rồi dùng mật
          khẩu đó cho các lần sau.
        </p>
      </Step>

      <Step n={2} title="Đăng ký các ngày muốn ăn">
        <p>
          Sau khi đăng nhập, bạn vào trang <b>Đặt cơm trưa</b>. Mỗi ô là một ngày từ thứ 2 đến thứ 6.
        </p>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            <b>Bấm vào ô</b> ngày muốn ăn. Ô chuyển sang <b className="text-red-600">màu đỏ có dấu ✓</b>, nghĩa là có ăn.
          </li>
          <li>Bấm lần nữa vào ô đó nếu đổi ý, ô trở về màu trắng.</li>
          <li>
            Có thể dùng nút <Key>Chọn cả tuần</Key> hoặc <Key>Bỏ chọn hết</Key> cho nhanh.
          </li>
          <li>
            Cuối cùng <b>bấm nút đỏ</b> <Key>Lưu đăng ký</Key>. Thấy dòng chữ xanh &quot;Đã lưu&quot; là xong.
          </li>
        </ul>
        <p className="font-semibold text-red-700">Chọn xong mà chưa bấm Lưu đăng ký thì hệ thống chưa ghi nhận.</p>
        <div className="grid grid-cols-2 gap-2 pt-1 sm:grid-cols-5">
          <Tile day="Thứ Hai" date="12/10" on label="Đã đăng ký" />
          <Tile day="Thứ Ba" date="13/10" on={false} label="Chưa đăng ký" />
          <Tile day="Thứ Tư" date="14/10" on label="Đã đăng ký" />
          <Tile day="Thứ Năm" date="15/10" on label="Đã đăng ký" />
          <Tile day="Thứ Sáu" date="16/10" on={false} label="Chưa đăng ký" />
        </div>
        <p className="text-xs text-slate-500">Hình minh họa: ô đỏ là ngày đã đăng ký, ô trắng là ngày chưa đăng ký.</p>
      </Step>

      <Step n={3} title="Hạn đăng ký">
        <p>
          Hệ thống chỉ mở <b>một tuần</b> để đăng ký tại mỗi thời điểm, và <b>hạn chót là hết ngày thứ 6</b> của tuần trước đó.
        </p>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            Ví dụ: muốn ăn tuần <b>19–23/10</b> thì phải đăng ký xong trước hết ngày <b>thứ 6, 16/10</b>.
          </li>
          <li>
            Sang <b>thứ 7</b>, hệ thống mở tuần kế tiếp để đăng ký.
          </li>
          <li>Quá hạn thì không thêm được ngày mới (các ô hiện &quot;Đã quá hạn&quot;), nhưng vẫn hủy được từng ngày.</li>
        </ul>
        <p>
          Bấm <Key>◀ Tuần trước</Key> / <Key>Tuần sau ▶</Key> để xem các tuần khác. Chỉ tuần có nhãn{" "}
          <b className="text-red-600">Đang mở đăng ký</b> mới sửa được, các tuần còn lại chỉ để xem.
        </p>
      </Step>

      <Step n={4} title="Hủy cơm khi không ăn được">
        <ol className="list-decimal space-y-1 pl-5">
          <li>
            Kéo xuống mục <b>Cơm sắp tới</b>, tìm đúng ngày cần hủy.
          </li>
          <li>
            Bấm <Key>Hủy cơm</Key>, rồi bấm <Key>Xác nhận hủy</Key>.
          </li>
        </ol>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            Phải hủy <b>trước 9h00 sáng của ngày đó</b>. Quá 9h00 nút Hủy cơm bị khóa vì căng tin đã chuẩn bị suất ăn.
          </li>
          <li>Hủy cho ngày hôm sau trở đi thì lúc nào cũng được.</li>
          <li>Hủy là bỏ hẳn ngày đó, không có suất bù.</li>
        </ul>
        <p>
          <b>Lỡ hủy nhầm?</b> Bấm <Key>Xem lịch sử</Key>, tìm ngày đã hủy rồi bấm <Key>Khôi phục</Key>. Cũng chỉ làm được trước
          9h00 sáng của ngày đó.
        </p>
      </Step>

      <Step n={5} title="Nhận cơm">
        <p>
          Căng tin in <b>danh sách cán bộ</b> cho mỗi bữa trưa. Khi nhận cơm, bạn tìm tên mình và <b>ký tên vào ô bên cạnh</b>.
          Bạn không phải bấm gì trên web lúc nhận cơm.
        </p>
      </Step>

      <Step n={6} title="Thông tin cá nhân và mật khẩu">
        <ul className="list-disc space-y-1 pl-5">
          <li>
            Bấm <Key>Hồ sơ</Key> ở góc phải phía trên để xem và sửa họ tên, số điện thoại. Sau khi đổi số điện thoại, lần sau
            bạn đăng nhập bằng số mới (hoặc bằng mã cán bộ).
          </li>
          <li>
            <b>Mã cán bộ</b> là cố định theo danh sách của trường, không tự đổi được.
          </li>
          <li>
            Bấm <Key>Đổi mật khẩu</Key> khi muốn đặt mật khẩu mới. <Key>Đăng xuất</Key> khi dùng chung máy với người khác.
          </li>
        </ul>
      </Step>

      <section className="break-inside-avoid rounded-2xl border border-slate-200 bg-white p-5 shadow-sm print:shadow-none">
        <h2 className="text-lg font-bold text-slate-800">Câu hỏi thường gặp</h2>
        <dl className="mt-3 space-y-3 text-sm leading-relaxed text-slate-700">
          <div>
            <dt className="font-semibold text-slate-800">Quên mật khẩu thì làm sao?</dt>
            <dd>Liên hệ quản trị viên để được đặt lại mật khẩu, sau đó đăng nhập và đổi mật khẩu mới.</dd>
          </div>
          <div>
            <dt className="font-semibold text-slate-800">Tôi thấy màn hình chỉ có logo, không bấm được gì?</dt>
            <dd>
              Đó là <b>màn hình chờ</b>, hiện ra khi không thao tác trong khoảng 45 giây. Chạm vào màn hình hoặc nhúc nhích chuột
              là quay lại ngay, không mất gì.
            </dd>
          </div>
          <div>
            <dt className="font-semibold text-slate-800">Tôi không thấy ngày nào để bấm?</dt>
            <dd>
              Bạn đang xem một tuần không mở đăng ký. Bấm <b>&quot;Về tuần đang mở đăng ký&quot;</b> để quay lại tuần cần đăng ký.
            </dd>
          </div>
          <div>
            <dt className="font-semibold text-slate-800">Lỡ quá hạn đăng ký thì sao?</dt>
            <dd>Hệ thống không cho thêm ngày mới sau hạn. Vui lòng liên hệ quản trị viên để được hỗ trợ.</dd>
          </div>
        </dl>
      </section>

      <footer className="pb-6 text-center text-xs text-slate-400">
        HMU THC Canteen · hmu-canteen.onrender.com · Mọi thắc mắc xin liên hệ quản trị viên hệ thống.
      </footer>
    </main>
  );
}
