import type { FormEvent } from "react";
import { invalidFieldMessage, type InvalidFlags } from "../shared/flowUsability";

type ValidityEl = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;

export function onFieldInvalid(messages: {
  valueMissing?: string;
  rangeUnderflow?: string;
  rangeOverflow?: string;
}) {
  return (e: FormEvent<ValidityEl>) => {
    const el = e.currentTarget;
    const flags: InvalidFlags = {
      valueMissing: el.validity.valueMissing,
      rangeUnderflow: el.validity.rangeUnderflow,
      rangeOverflow: el.validity.rangeOverflow,
    };
    el.setCustomValidity(invalidFieldMessage(flags, messages));
  };
}

export function clearFieldValidity(e: FormEvent<ValidityEl>) {
  e.currentTarget.setCustomValidity("");
}

export function scrollToId(id: string) {
  requestAnimationFrame(() => {
    document.getElementById(id)?.scrollIntoView({ block: "nearest" });
  });
}
