import './globals.css';

export const metadata = {
  title: 'POS - দোকানের হিসাব',
  description: 'সহজ POS ও দোকান ম্যানেজমেন্ট সিস্টেম',
};

export default function RootLayout({ children }) {
  return (
    <html lang="bn">
      <body>{children}</body>
    </html>
  );
}
