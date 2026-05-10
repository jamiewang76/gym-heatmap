"use client";

import { STATE_ID_TO_NAME } from "@/lib/constants";

interface Props {
  stateId: string;
  count: number;
  onClose: () => void;
}

export default function StateBottomSheet({ stateId, count, onClose }: Props) {
  const name = STATE_ID_TO_NAME[stateId] ?? stateId;

  return (
    <>
      <div className="fixed inset-0 bg-black/70 z-40" onClick={onClose} />
      <div className="fixed bottom-0 left-0 right-0 max-w-[430px] mx-auto bg-[#1a1a1a] border-t border-[#C5A059] z-50 p-6 panel-slide-up">
        <button
          onClick={onClose}
          className="absolute top-3 right-4 text-[#666] text-xl leading-none"
          aria-label="Close"
        >
          ✕
        </button>
        <h2 className="text-[#C5A059] text-xl font-bold mb-1">{name}</h2>
        <p className="text-white text-base">
          {count.toLocaleString()} session{count !== 1 ? "s" : ""} this week
        </p>
      </div>
    </>
  );
}
