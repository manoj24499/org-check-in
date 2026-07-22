"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Confetti from "react-confetti";
import { CheckCircle2, Clock } from "lucide-react";

type StatusClientProps = {
  name: string;
  type: "CHECK_IN" | "CHECK_OUT";
  timestamp: Date;
  workHours: number;
  checkInTime: Date | null;
};

const INSPIRING_MESSAGES = [
  "Have a productive day!",
  "Let's build something amazing today!",
  "You're going to do great things today!",
  "Rise and shine, time to shine!",
  "Every day is a fresh start!",
  "Make today your masterpiece!",
];

export default function StatusClient({ name, type, timestamp, workHours, checkInTime }: StatusClientProps) {
  const router = useRouter();
  const [timeLeft, setTimeLeft] = useState(30);
  const [message, setMessage] = useState("");
  const [windowSize, setWindowSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    // Set random message on mount (only for check-in)
    if (type === "CHECK_IN") {
      const randomMsg = INSPIRING_MESSAGES[Math.floor(Math.random() * INSPIRING_MESSAGES.length)];
      setMessage(randomMsg);
      setWindowSize({ width: window.innerWidth, height: window.innerHeight });
    }
  }, [type]);

  useEffect(() => {
    if (timeLeft <= 0) {
      router.push("/kiosk");
      return;
    }

    const timer = setInterval(() => {
      setTimeLeft((prev) => prev - 1);
    }, 1000);

    return () => clearInterval(timer);
  }, [timeLeft, router]);

  const isCheckIn = type === "CHECK_IN";

  return (
    <main className="min-h-screen flex items-center justify-center bg-slate-50 relative overflow-hidden">
      {isCheckIn && windowSize.width > 0 && (
        <Confetti width={windowSize.width} height={windowSize.height} recycle={false} numberOfPieces={400} />
      )}

      <div className="w-full max-w-lg bg-white rounded-3xl shadow-xl border border-slate-100 p-10 flex flex-col items-center z-10 text-center animate-in fade-in zoom-in duration-500">
        <div className={`w-20 h-20 rounded-full flex items-center justify-center mb-6 shadow-inner ${isCheckIn ? "bg-emerald-100 text-emerald-600" : "bg-amber-100 text-amber-600"}`}>
          <CheckCircle2 size={40} strokeWidth={2.5} />
        </div>

        <h1 className="text-3xl font-bold text-slate-900 mb-2">
          {isCheckIn ? "Welcome," : "Goodbye,"} {name}!
        </h1>
        
        <p className="text-lg text-slate-500 mb-8 font-medium">
          {isCheckIn ? "Checked in" : "Checked out"} at {new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </p>

        {isCheckIn ? (
          <div className="bg-emerald-50 border border-emerald-100 rounded-2xl p-6 w-full mb-8">
            <p className="text-xl font-medium text-emerald-800 italic">"{message}"</p>
          </div>
        ) : (
          <div className="bg-slate-50 border border-slate-200 rounded-2xl p-6 w-full mb-8 flex flex-col gap-4">
            <div className="flex justify-between items-center pb-4 border-b border-slate-200">
              <span className="text-slate-500 font-medium">Check-In Time</span>
              <span className="text-slate-900 font-bold">
                {checkInTime ? new Date(checkInTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : "N/A"}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-slate-500 font-medium">Today's Work Hours</span>
              <span className="text-slate-900 font-bold text-xl">
                {workHours > 0 ? `${workHours.toFixed(2)} hrs` : "N/A"}
              </span>
            </div>
          </div>
        )}

        <button 
          onClick={() => router.push("/kiosk")}
          className="w-full py-4 rounded-xl bg-slate-900 text-white font-semibold hover:bg-slate-800 transition-colors shadow-md hover:shadow-lg flex items-center justify-center gap-2"
        >
          <Clock size={20} />
          Return to Kiosk ({timeLeft}s)
        </button>
      </div>
    </main>
  );
}
