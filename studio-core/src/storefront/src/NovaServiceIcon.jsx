import {
  ArrowsClockwise,
  ChatCircleText,
  CreditCard,
  Headphones,
  LifeBuoy,
  Package,
  Truck,
} from "./CustomerIcon.jsx";

const ICONS = Object.freeze({
  help: LifeBuoy,
  orders: Package,
  delivery: Truck,
  returns: ArrowsClockwise,
  payment: CreditCard,
  support: Headphones,
  bot: ChatCircleText,
});

export function NovaServiceIcon({ kind = "help", compact = false }) {
  const Icon = ICONS[kind] || ICONS.help;
  return (
    <span className={`nova-service-icon${compact ? " is-compact" : ""}`} aria-hidden="true">
      <Icon className="nova-service-icon__glyph" />
    </span>
  );
}
