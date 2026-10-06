'use client';

const money = (n) => '৳' + Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 });
const METHOD = { cash: 'নগদ', card: 'কার্ড', mobile: 'মোবাইল ব্যাংকিং', due: 'বাকি' };

export default function Receipt({ data, onClose }) {
  const { sale, items, customer, shop } = data;
  const when = new Date(sale.created_at).toLocaleString('en-GB', {
    timeZone: 'Asia/Dhaka',
    dateStyle: 'medium',
    timeStyle: 'short',
  });

  return (
    <div className="fixed inset-0 bg-black/40 z-30 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-sm max-h-[92vh] overflow-y-auto">
        <div className="print-area p-5 text-sm text-black">
          <div className="text-center">
            <div className="text-lg font-bold">{shop?.name}</div>
            {shop?.address && <div className="text-xs">{shop.address}</div>}
            {shop?.phone && <div className="text-xs">ফোন: {shop.phone}</div>}
          </div>

          <div className="border-t border-dashed my-3" />
          <div className="flex justify-between text-xs">
            <span>ইনভয়েস: {sale.invoice_no}</span>
            <span>{when}</span>
          </div>
          <div className="text-xs mt-1">কাস্টমার: {customer?.name || 'খুচরা'}</div>
          <div className="border-t border-dashed my-3" />

          <table className="w-full text-xs">
            <thead>
              <tr className="text-left">
                <th className="pb-1">পণ্য</th>
                <th className="pb-1 text-right">পরিমাণ × দাম</th>
                <th className="pb-1 text-right">মোট</th>
              </tr>
            </thead>
            <tbody>
              {items.map((i) => (
                <tr key={i.id} className="align-top">
                  <td className="py-0.5 pr-1">{i.product_name}</td>
                  <td className="py-0.5 text-right whitespace-nowrap">
                    {Number(i.qty)} × {Number(i.unit_price)}
                  </td>
                  <td className="py-0.5 text-right whitespace-nowrap">{money(i.line_total)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="border-t border-dashed my-3" />
          <div className="space-y-1">
            <div className="flex justify-between">
              <span>সাবটোটাল</span>
              <span>{money(sale.subtotal)}</span>
            </div>
            {Number(sale.discount) > 0 && (
              <div className="flex justify-between">
                <span>ডিসকাউন্ট</span>
                <span>-{money(sale.discount)}</span>
              </div>
            )}
            <div className="flex justify-between text-base font-bold">
              <span>সর্বমোট</span>
              <span>{money(sale.total)}</span>
            </div>
            <div className="flex justify-between">
              <span>পরিশোধ ({METHOD[sale.payment_method]})</span>
              <span>{money(sale.paid)}</span>
            </div>
            {Number(sale.due) > 0 && (
              <div className="flex justify-between font-bold">
                <span>বাকি</span>
                <span>{money(sale.due)}</span>
              </div>
            )}
          </div>

          <div className="border-t border-dashed my-3" />
          <div className="text-center text-xs">{shop?.receipt_footer || 'ধন্যবাদ! আবার আসবেন।'}</div>
        </div>

        <div className="flex gap-3 p-4 border-t no-print">
          <button onClick={onClose} className="flex-1 border rounded-lg py-2.5">
            বন্ধ করুন
          </button>
          <button
            onClick={() => window.print()}
            className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg py-2.5 font-medium"
          >
            🖨️ প্রিন্ট
          </button>
        </div>
      </div>
    </div>
  );
}
