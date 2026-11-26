"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

type Ticket = {
  id: string;
  user_id: string;
  username?: string;
  subject: string;
  category: string;
  status: "open" | "in_progress" | "waiting_user" | "closed";
  last_message?: string;
  created_at: string;
  updated_at: string;
};

type Message = {
  id: string;
  sender_id: string;
  username: string;
  message: string;
  is_staff: number;
  created_at: string;
};

const statusLabels: Record<Ticket["status"], string> = {
  open: "جدید",
  in_progress: "در حال بررسی",
  waiting_user: "منتظر پاسخ کاربر",
  closed: "بسته‌شده"
};

async function api(url: string, options: RequestInit = {}) {
  const response = await fetch(url, {
    ...options,
    credentials: "same-origin",
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...options.headers
    }
  });
  const data: any = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "درخواست ناموفق بود.");
  return data;
}

export default function SupportPage() {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [selected, setSelected] = useState<Ticket | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [staff, setStaff] = useState(false);
  const [user, setUser] = useState<any>(null);
  const [filter, setFilter] = useState("open");
  const [subject, setSubject] = useState("");
  const [category, setCategory] = useState("general");
  const [newMessage, setNewMessage] = useState("");
  const [reply, setReply] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");

  const loadTickets = useCallback(async () => {
    const data = await api(`/api/tickets${staff ? `?status=${filter}` : ""}`);
    setTickets(data.tickets || []);
    setStaff(!!data.staff);
  }, [staff, filter]);

  const openTicket = async (ticket: Ticket) => {
    setBusy(true);
    try {
      const data = await api(`/api/tickets/${ticket.id}`);
      setSelected(data.ticket);
      setMessages(data.messages || []);
      setStaff(!!data.staff);
      setNotice("");
    } catch (error: any) {
      setNotice(error.message);
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    api("/api/auth/me").then(data => {
      if (!data.user) throw new Error("برای استفاده از پشتیبانی وارد حساب شو.");
      setUser(data.user);
    }).catch(error => setNotice(error.message));
  }, []);

  useEffect(() => {
    if (!user) return;
    loadTickets().catch(error => setNotice(error.message));
  }, [user, loadTickets]);

  const createTicket = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    try {
      const data = await api("/api/tickets", {
        method: "POST",
        body: JSON.stringify({ subject, category, message: newMessage })
      });
      setSubject("");
      setNewMessage("");
      setNotice("تیکت با موفقیت ثبت شد.");
      await loadTickets();
      const created = await api(`/api/tickets/${data.ticketId}`);
      setSelected(created.ticket);
      setMessages(created.messages || []);
    } catch (error: any) {
      setNotice(error.message);
    } finally {
      setBusy(false);
    }
  };

  const sendReply = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selected || !reply.trim()) return;
    setBusy(true);
    try {
      await api(`/api/tickets/${selected.id}`, {
        method: "POST",
        body: JSON.stringify({ message: reply })
      });
      setReply("");
      await openTicket(selected);
      await loadTickets();
      setNotice("پاسخ ارسال شد.");
    } catch (error: any) {
      setNotice(error.message);
    } finally {
      setBusy(false);
    }
  };

  const changeStatus = async (status: Ticket["status"]) => {
    if (!selected) return;
    setBusy(true);
    try {
      await api(`/api/tickets/${selected.id}`, {
        method: "PATCH",
        body: JSON.stringify({ status })
      });
      await openTicket(selected);
      await loadTickets();
      setNotice("وضعیت تیکت تغییر کرد.");
    } catch (error: any) {
      setNotice(error.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="min-h-screen bg-[#0c0916] text-white px-4 py-8 md:px-8">
      <div className="mx-auto max-w-6xl">
        <header className="mb-8 flex flex-wrap items-center justify-between gap-4">
          <div>
            <Link href="/" className="text-sm text-purple-300 hover:text-white">← بازگشت به فروشگاه</Link>
            <h1 className="mt-3 text-3xl font-bold">مرکز پشتیبانی RPCRAFT</h1>
            <p className="mt-2 text-sm text-gray-400">درخواست‌ها و گفتگوهای پشتیبانی حساب تو</p>
          </div>
          {staff && <span className="rounded-full border border-purple-400/40 px-4 py-2 text-sm text-purple-200">پنل رسیدگی پشتیبانی</span>}
        </header>

        {notice && <div role="status" className="mb-5 rounded-xl border border-purple-400/30 bg-purple-500/10 p-4 text-sm">{notice}</div>}

        {!user && <div className="rounded-2xl border border-white/10 bg-white/5 p-6">برای استفاده از پشتیبانی ابتدا وارد حساب شو.</div>}

        {user && (
          <div className="grid gap-6 lg:grid-cols-[340px_1fr]">
            <aside className="space-y-5">
              {(!staff || !selected) && (
                <form onSubmit={createTicket} className="space-y-3 rounded-2xl border border-white/10 bg-white/[0.04] p-5">
                  <h2 className="text-lg font-bold">ثبت تیکت جدید</h2>
                  <input required minLength={3} maxLength={120} value={subject} onChange={e => setSubject(e.target.value)} placeholder="موضوع درخواست" className="w-full rounded-xl border border-white/10 bg-black/30 p-3 text-sm outline-none focus:border-purple-400" />
                  <select value={category} onChange={e => setCategory(e.target.value)} className="w-full rounded-xl border border-white/10 bg-[#171225] p-3 text-sm">
                    <option value="general">پشتیبانی عمومی</option>
                    <option value="account">حساب کاربری</option>
                    <option value="product">محصول و پلاگین</option>
                    <option value="seller">فروشندگی</option>
                    <option value="technical">مشکل فنی</option>
                  </select>
                  <textarea required minLength={5} maxLength={5000} rows={4} value={newMessage} onChange={e => setNewMessage(e.target.value)} placeholder="توضیحات درخواست..." className="w-full rounded-xl border border-white/10 bg-black/30 p-3 text-sm outline-none focus:border-purple-400" />
                  <button disabled={busy} className="w-full rounded-xl bg-purple-600 p-3 font-bold hover:bg-purple-500 disabled:opacity-50">ثبت درخواست</button>
                </form>
              )}

              <section className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                <div className="mb-4 flex items-center justify-between gap-2">
                  <h2 className="font-bold">{staff ? "همه درخواست‌ها" : "تیکت‌های من"}</h2>
                  {staff && <select value={filter} onChange={e => setFilter(e.target.value)} className="rounded-lg bg-[#171225] p-2 text-xs">
                    <option value="open">جدید</option>
                    <option value="in_progress">در حال بررسی</option>
                    <option value="waiting_user">منتظر کاربر</option>
                    <option value="closed">بسته‌شده</option>
                  </select>}
                </div>
                <div className="space-y-2">
                  {tickets.length === 0 && <p className="py-5 text-center text-sm text-gray-500">تیکتی وجود ندارد.</p>}
                  {tickets.map(ticket => (
                    <button key={ticket.id} onClick={() => openTicket(ticket)} className={`w-full rounded-xl border p-3 text-right transition ${selected?.id === ticket.id ? "border-purple-400 bg-purple-500/10" : "border-white/10 bg-black/20 hover:border-white/30"}`}>
                      <span className="block font-semibold">{ticket.subject}</span>
                      {staff && <span className="mt-1 block text-xs text-purple-300">{ticket.username}</span>}
                      <span className="mt-2 block text-xs text-gray-400">{statusLabels[ticket.status]}</span>
                      {ticket.last_message && <span className="mt-2 block truncate text-xs text-gray-500">{ticket.last_message}</span>}
                    </button>
                  ))}
                </div>
              </section>
            </aside>

            <section className="min-h-[520px] rounded-2xl border border-white/10 bg-white/[0.04] p-5">
              {!selected ? (
                <div className="flex min-h-[480px] flex-col items-center justify-center text-center text-gray-400">
                  <div className="mb-4 text-5xl">✉</div>
                  <h2 className="text-xl font-bold text-white">گفتگوی پشتیبانی</h2>
                  <p className="mt-2 text-sm">برای مشاهده پیام‌ها، یک تیکت را انتخاب کن.</p>
                </div>
              ) : (
                <>
                  <div className="mb-5 flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-4">
                    <div>
                      <h2 className="text-xl font-bold">{selected.subject}</h2>
                      <p className="mt-1 text-xs text-gray-400">{selected.username || user.username} · {statusLabels[selected.status]}</p>
                    </div>
                    {staff && <select value={selected.status} onChange={e => changeStatus(e.target.value as Ticket["status"])} className="rounded-xl border border-white/10 bg-[#171225] p-2 text-sm">
                      <option value="open">جدید</option>
                      <option value="in_progress">در حال بررسی</option>
                      <option value="waiting_user">منتظر پاسخ کاربر</option>
                      <option value="closed">بسته‌شده</option>
                    </select>}
                  </div>

                  <div className="max-h-[430px] space-y-4 overflow-y-auto py-2">
                    {messages.map(message => (
                      <article key={message.id} className={`max-w-[90%] rounded-2xl p-4 ${message.is_staff ? "ml-auto bg-purple-500/15" : "mr-auto bg-white/[0.07]"}`}>
                        <div className="mb-2 flex items-center justify-between gap-4 text-xs text-gray-400">
                          <span>{message.username} {message.is_staff ? "· پشتیبانی" : ""}</span>
                          <time>{new Date(message.created_at.replace(" ", "T") + "Z").toLocaleString("fa-IR")}</time>
                        </div>
                        <p className="whitespace-pre-wrap break-words text-sm leading-7">{message.message}</p>
                      </article>
                    ))}
                  </div>

                  {selected.status !== "closed" ? (
                    <form onSubmit={sendReply} className="mt-5 flex flex-col gap-3 border-t border-white/10 pt-4">
                      <textarea required maxLength={5000} rows={3} value={reply} onChange={e => setReply(e.target.value)} placeholder="پیام خود را بنویس..." className="w-full rounded-xl border border-white/10 bg-black/30 p-3 text-sm outline-none focus:border-purple-400" />
                      <div className="flex justify-end">
                        <button disabled={busy || !reply.trim()} className="rounded-xl bg-purple-600 px-6 py-3 text-sm font-bold hover:bg-purple-500 disabled:opacity-50">ارسال پاسخ</button>
                      </div>
                    </form>
                  ) : <p className="mt-5 border-t border-white/10 pt-4 text-center text-sm text-gray-500">این تیکت بسته شده است.</p>}
                </>
              )}
            </section>
          </div>
        )}
      </div>
    </main>
  );
}
