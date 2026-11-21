/** 多帳號比較：載入中的骨架畫面。 */
export default function Loading() {
  return (
    <div className="flex flex-col gap-6" aria-busy="true" aria-label="載入中">
      <div className="skeleton h-7 w-48" />
      <div className="skeleton h-48 w-full" />
      <div className="skeleton h-72 w-full" style={{ animationDelay: "120ms" }} />
    </div>
  );
}
