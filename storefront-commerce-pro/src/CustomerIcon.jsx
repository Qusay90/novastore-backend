import {
  ArrowLeft as LucideArrowLeft,
  ArrowLeftRight,
  BadgePercent as LucideBadgePercent,
  Baby as LucideBaby,
  Bell as LucideBell,
  Bot as LucideBot,
  Check as LucideCheck,
  ChevronDown,
  ChevronRight,
  CircleAlert,
  CircleCheck,
  CircleHelp,
  Clock as LucideClock,
  Copy as LucideCopy,
  CreditCard as LucideCreditCard,
  Funnel as LucideFunnel,
  Flower2,
  Grid2X2,
  Headphones as LucideHeadphones,
  Heart as LucideHeart,
  House as LucideHouse,
  Image as LucideImage,
  Key as LucideKey,
  Laptop as LucideLaptop,
  List as LucideList,
  LockKeyhole,
  LogOut,
  Mail,
  MapPin as LucideMapPin,
  MessageCircle,
  Minus as LucideMinus,
  Package as LucidePackage,
  Pencil,
  PersonStanding,
  Plus as LucidePlus,
  Receipt as LucideReceipt,
  RefreshCw,
  Search,
  Send,
  ShieldCheck as LucideShieldCheck,
  Shirt,
  ShoppingBag as LucideShoppingBag,
  ShoppingCart as LucideShoppingCart,
  SlidersHorizontal as LucideSlidersHorizontal,
  Smartphone,
  Star as LucideStar,
  Store,
  Ticket as LucideTicket,
  Trash2,
  Truck as LucideTruck,
  Tv,
  User as LucideUser,
  UserMinus as LucideUserMinus,
  UserPlus as LucideUserPlus,
  Users as LucideUsers,
  Video as LucideVideo,
  Watch as LucideWatch,
  X as LucideX,
} from "lucide-react";

const adapt = (Icon) => function CustomerIcon({ weight, fill, strokeWidth, ...props }) {
  const filled = weight === "fill";
  return (
    <Icon
      aria-hidden={props["aria-label"] ? undefined : true}
      fill={filled ? "currentColor" : fill || "none"}
      strokeWidth={strokeWidth ?? (weight === "bold" ? 2.25 : 2)}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    />
  );
};

export const ArrowLeft = adapt(LucideArrowLeft);
export const ArrowsLeftRight = adapt(ArrowLeftRight);
export const ArrowsClockwise = adapt(RefreshCw);
export const BadgePercent = adapt(LucideBadgePercent);
export const Baby = adapt(LucideBaby);
export const Bell = adapt(LucideBell);
export const Bot = adapt(LucideBot);
export const CaretDown = adapt(ChevronDown);
export const CaretRight = adapt(ChevronRight);
export const Check = adapt(LucideCheck);
export const CheckCircle = adapt(CircleCheck);
export const CreditCard = adapt(LucideCreditCard);
export const DeviceMobile = adapt(Smartphone);
export const EnvelopeSimple = adapt(Mail);
export const Funnel = adapt(LucideFunnel);
export const Flower = adapt(Flower2);
export const GridFour = adapt(Grid2X2);
export const Headphones = adapt(LucideHeadphones);
export const Heart = adapt(LucideHeart);
export const House = adapt(LucideHouse);
export const ImageSquare = adapt(LucideImage);
export const Laptop = adapt(LucideLaptop);
export const List = adapt(LucideList);
export const MagnifyingGlass = adapt(Search);
export const MapPin = adapt(LucideMapPin);
export const Minus = adapt(LucideMinus);
export const Package = adapt(LucidePackage);
export const PersonSimpleRun = adapt(PersonStanding);
export const Plus = adapt(LucidePlus);
export const Question = adapt(CircleHelp);
export const Receipt = adapt(LucideReceipt);
export const ShieldCheck = adapt(LucideShieldCheck);
export const ShoppingBag = adapt(LucideShoppingBag);
export const ShoppingBagOpen = adapt(LucideShoppingBag);
export const ShoppingCart = adapt(LucideShoppingCart);
export const SlidersHorizontal = adapt(LucideSlidersHorizontal);
export const Star = adapt(LucideStar);
export const Storefront = adapt(Store);
export const Television = adapt(Tv);
export const Ticket = adapt(LucideTicket);
export const Trash = adapt(Trash2);
export const Truck = adapt(LucideTruck);
export const TShirt = adapt(Shirt);
export const User = adapt(LucideUser);
export const Watch = adapt(LucideWatch);
export const WarningCircle = adapt(CircleAlert);
export const X = adapt(LucideX);
export const VideoCamera = adapt(LucideVideo);
export const ChatCircleText = adapt(MessageCircle);
export const Clock = adapt(LucideClock);
export const Copy = adapt(LucideCopy);
export const Key = adapt(LucideKey);
export const LockKey = adapt(LockKeyhole);
export const PaperPlaneTilt = adapt(Send);
export const PencilSimple = adapt(Pencil);
export const SignOut = adapt(LogOut);
export const UserMinus = adapt(LucideUserMinus);
export const UserPlus = adapt(LucideUserPlus);
export const Users = adapt(LucideUsers);

export const CUSTOMER_ICON_SEMANTICS = Object.freeze({
  navigation: Object.freeze({ back: ArrowLeft, forward: CaretRight, expand: CaretDown, home: House }),
  commerce: Object.freeze({ cart: ShoppingCart, bag: ShoppingBag, compare: ArrowsLeftRight, discount: BadgePercent }),
  account: Object.freeze({ profile: User, signOut: SignOut, security: ShieldCheck, notification: Bell }),
  service: Object.freeze({ help: Question, support: Headphones, delivery: Truck, return: ArrowsClockwise }),
  feedback: Object.freeze({ success: CheckCircle, warning: WarningCircle, close: X, favorite: Heart }),
});
