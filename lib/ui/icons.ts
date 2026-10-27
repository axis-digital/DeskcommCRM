/**
 * Catálogo canônico de ícones da interface.
 *
 * O design system Axis usa Lucide, sempre outline e monocromático, com traço
 * entre 1.75 px e 2 px. `weight` permanece temporariamente no contrato para a
 * migração dos consumidores Phosphor sem uma troca big-bang.
 */

import {
  createElement,
  forwardRef,
  type ForwardRefExoticComponent,
  type RefAttributes,
} from "react";
import {
  Archive as ArchiveLucide,
  ArrowLeft as ArrowLeftLucide,
  ArrowLeftRight as ArrowLeftRightLucide,
  ArrowRight as ArrowRightLucide,
  Bell as BellLucide,
  BellOff as BellOffLucide,
  BookOpen as BookOpenLucide,
  Bot as BotLucide,
  Brain as BrainLucide,
  Building2 as Building2Lucide,
  Calendar as CalendarLucide,
  CalendarCheck as CalendarCheckLucide,
  CalendarDays as CalendarDaysLucide,
  CalendarPlus as CalendarPlusLucide,
  CalendarX as CalendarXLucide,
  ChartBar as ChartBarLucide,
  ChartLine as ChartLineLucide,
  Check as CheckLucide,
  CheckCheck as CheckCheckLucide,
  ChevronDown as ChevronDownLucide,
  ChevronLeft as ChevronLeftLucide,
  ChevronRight as ChevronRightLucide,
  ChevronsLeft as ChevronsLeftLucide,
  ChevronsRight as ChevronsRightLucide,
  ChevronUp as ChevronUpLucide,
  Circle as CircleLucide,
  CircleArrowUp as CircleArrowUpLucide,
  CircleCheck as CircleCheckLucide,
  CircleHelp as CircleHelpLucide,
  CircleUserRound as CircleUserRoundLucide,
  ClipboardList as ClipboardListLucide,
  Clock as ClockLucide,
  ContactRound as ContactRoundLucide,
  Copy as CopyLucide,
  Dot as DotLucide,
  Download as DownloadLucide,
  Ellipsis as EllipsisLucide,
  Expand as ExpandLucide,
  ExternalLink as ExternalLinkLucide,
  Eye as EyeLucide,
  EyeOff as EyeOffLucide,
  FileText as FileTextLucide,
  Flag as FlagLucide,
  Forward as ForwardLucide,
  Funnel as FunnelLucide,
  Gauge as GaugeLucide,
  GitBranch as GitBranchLucide,
  Globe as GlobeLucide,
  GripVertical as GripVerticalLucide,
  History as HistoryLucide,
  House as HouseLucide,
  Image as ImageLucide,
  Images as ImagesLucide,
  Inbox as InboxLucide,
  Info as InfoLucide,
  Kanban as KanbanLucide,
  Keyboard as KeyboardLucide,
  KeyRound as KeyRoundLucide,
  Layers as LayersLucide,
  Lightbulb as LightbulbLucide,
  List as ListLucide,
  ListChecks as ListChecksLucide,
  LoaderCircle as LoaderCircleLucide,
  Lock as LockLucide,
  LockOpen as LockOpenLucide,
  LogOut as LogOutLucide,
  Mail as MailLucide,
  MapPin as MapPinLucide,
  Megaphone as MegaphoneLucide,
  MessageCircle as MessageCircleLucide,
  MessageCircleMore as MessageCircleMoreLucide,
  MessageSquare as MessageSquareLucide,
  Mic as MicLucide,
  MicOff as MicOffLucide,
  MonitorPlay as MonitorPlayLucide,
  Moon as MoonLucide,
  Music as MusicLucide,
  Network as NetworkLucide,
  OctagonAlert as OctagonAlertLucide,
  Package as PackageLucide,
  Palette as PaletteLucide,
  Paperclip as PaperclipLucide,
  Pause as PauseLucide,
  Pencil as PencilLucide,
  Phone as PhoneLucide,
  PhoneIncoming as PhoneIncomingLucide,
  PhoneOff as PhoneOffLucide,
  PhoneOutgoing as PhoneOutgoingLucide,
  Play as PlayLucide,
  Plug as PlugLucide,
  PlugZap as PlugZapLucide,
  Plus as PlusLucide,
  Puzzle as PuzzleLucide,
  QrCode as QrCodeLucide,
  Receipt as ReceiptLucide,
  RefreshCw as RefreshCwLucide,
  Reply as ReplyLucide,
  Scale as ScaleLucide,
  Search as SearchLucide,
  Send as SendLucide,
  Settings as SettingsLucide,
  ShieldCheck as ShieldCheckLucide,
  Signpost as SignpostLucide,
  SkipForward as SkipForwardLucide,
  Smile as SmileLucide,
  Smartphone as SmartphoneLucide,
  Sparkles as SparklesLucide,
  StickyNote as StickyNoteLucide,
  Store as StoreLucide,
  Sun as SunLucide,
  Tag as TagLucide,
  Timer as TimerLucide,
  Trash2 as Trash2Lucide,
  TriangleAlert as TriangleAlertLucide,
  Upload as UploadLucide,
  Users as UsersLucide,
  Video as VideoLucide,
  Webhook as WebhookLucide,
  Wifi as WifiLucide,
  WifiOff as WifiOffLucide,
  Workflow as WorkflowLucide,
  X as XLucide,
  type LucideIcon,
  type LucideProps,
} from "lucide-react";

export type AxisIconWeight = "thin" | "light" | "regular" | "duotone" | "bold" | "fill";

export type AxisIconProps = Omit<LucideProps, "strokeWidth"> & {
  /** Compatibilidade de migração: o estilo final permanece sempre outline. */
  weight?: AxisIconWeight;
  strokeWidth?: number;
};

export type AxisIcon = ForwardRefExoticComponent<
  Omit<AxisIconProps, "ref"> & RefAttributes<SVGSVGElement>
>;

const STROKE_BY_WEIGHT: Record<AxisIconWeight, number> = {
  thin: 1.75,
  light: 1.75,
  regular: 1.75,
  duotone: 1.75,
  bold: 2,
  fill: 2,
};

function axisStrokeWidth(weight: AxisIconWeight, strokeWidth?: number): number {
  const requested = strokeWidth ?? STROKE_BY_WEIGHT[weight];
  return Math.min(2, Math.max(1.75, requested));
}

function axisIcon(Icon: LucideIcon, displayName: string): AxisIcon {
  const Component = forwardRef<SVGSVGElement, AxisIconProps>(
    ({ size = "1em", weight = "regular", strokeWidth, ...props }, ref) =>
      createElement(Icon, {
        ...props,
        ref,
        fill: "none",
        size,
        strokeWidth: axisStrokeWidth(weight, strokeWidth),
      }),
  );
  Component.displayName = displayName;
  return Component;
}

// Navegação e estrutura
export const Inbox = /* @__PURE__ */ axisIcon(InboxLucide, "Inbox");
export const ListChecks = /* @__PURE__ */ axisIcon(ListChecksLucide, "ListChecks");
export const Plugs = /* @__PURE__ */ axisIcon(PlugLucide, "Plugs");
export const PlugsConnected = /* @__PURE__ */ axisIcon(PlugZapLucide, "PlugsConnected");
export const QrCode = /* @__PURE__ */ axisIcon(QrCodeLucide, "QrCode");
export const Kanban = /* @__PURE__ */ axisIcon(KanbanLucide, "Kanban");
export const Users = /* @__PURE__ */ axisIcon(UsersLucide, "Users");
export const UsersThree = /* @__PURE__ */ axisIcon(UsersLucide, "UsersThree");
export const Storefront = /* @__PURE__ */ axisIcon(StoreLucide, "Storefront");
export const Robot = /* @__PURE__ */ axisIcon(BotLucide, "Robot");
export const Sparkle = /* @__PURE__ */ axisIcon(SparklesLucide, "Sparkle");
export const ShieldCheck = /* @__PURE__ */ axisIcon(ShieldCheckLucide, "ShieldCheck");
export const Gear = /* @__PURE__ */ axisIcon(SettingsLucide, "Gear");
export const House = /* @__PURE__ */ axisIcon(HouseLucide, "House");
export const Buildings = /* @__PURE__ */ axisIcon(Building2Lucide, "Buildings");
export const FlowArrow = /* @__PURE__ */ axisIcon(WorkflowLucide, "FlowArrow");
export const ChatsCircle = /* @__PURE__ */ axisIcon(MessageCircleMoreLucide, "ChatsCircle");
export const ClipboardText = /* @__PURE__ */ axisIcon(ClipboardListLucide, "ClipboardText");
export const Scales = /* @__PURE__ */ axisIcon(ScaleLucide, "Scales");
export const ScalesSimple = Scales;
export const Gauge = /* @__PURE__ */ axisIcon(GaugeLucide, "Gauge");
export const WifiSlash = /* @__PURE__ */ axisIcon(WifiOffLucide, "WifiSlash");
export const Clock = /* @__PURE__ */ axisIcon(ClockLucide, "Clock");
export const Palette = /* @__PURE__ */ axisIcon(PaletteLucide, "Palette");
export const Megaphone = /* @__PURE__ */ axisIcon(MegaphoneLucide, "Megaphone");
export const WifiHigh = /* @__PURE__ */ axisIcon(WifiLucide, "WifiHigh");
export const Brain = /* @__PURE__ */ axisIcon(BrainLucide, "Brain");
export const ArrowsClockwise = /* @__PURE__ */ axisIcon(RefreshCwLucide, "ArrowsClockwise");
export const Dot = /* @__PURE__ */ axisIcon(DotLucide, "Dot");

// Ações
export const ArrowBendUpLeft = /* @__PURE__ */ axisIcon(ReplyLucide, "ArrowBendUpLeft");
// encaminhar (#2835): a seta espelhada do "Responder" — mesma família, para os dois
// gestos da bolha lerem como par.
export const ArrowBendUpRight = /* @__PURE__ */ axisIcon(ForwardLucide, "ArrowBendUpRight");
export const DeviceMobile = /* @__PURE__ */ axisIcon(SmartphoneLucide, "DeviceMobile");
// reordenar por arrastar e soltar (#3244): a alça da lista de respostas rápidas
export const DragHandle = /* @__PURE__ */ axisIcon(GripVerticalLucide, "DragHandle");
export const ArrowLeft = /* @__PURE__ */ axisIcon(ArrowLeftLucide, "ArrowLeft");
export const ArrowsLeftRight = /* @__PURE__ */ axisIcon(ArrowLeftRightLucide, "ArrowsLeftRight");
export const ArrowRight = /* @__PURE__ */ axisIcon(ArrowRightLucide, "ArrowRight");
export const List = /* @__PURE__ */ axisIcon(ListLucide, "List");
export const Bell = /* @__PURE__ */ axisIcon(BellLucide, "Bell");
export const BellSlash = /* @__PURE__ */ axisIcon(BellOffLucide, "BellSlash");
export const EnvelopeSimple = /* @__PURE__ */ axisIcon(MailLucide, "EnvelopeSimple");
export const PaperPlaneTilt = /* @__PURE__ */ axisIcon(SendLucide, "PaperPlaneTilt");
export const Smiley = /* @__PURE__ */ axisIcon(SmileLucide, "Smiley");
export const Check = /* @__PURE__ */ axisIcon(CheckLucide, "Check");
export const Checks = /* @__PURE__ */ axisIcon(CheckCheckLucide, "Checks");
export const X = /* @__PURE__ */ axisIcon(XLucide, "X");
export const Plus = /* @__PURE__ */ axisIcon(PlusLucide, "Plus");
export const Trash = /* @__PURE__ */ axisIcon(Trash2Lucide, "Trash");
export const PencilSimple = /* @__PURE__ */ axisIcon(PencilLucide, "PencilSimple");
export const MagnifyingGlass = /* @__PURE__ */ axisIcon(SearchLucide, "MagnifyingGlass");
export const Pause = /* @__PURE__ */ axisIcon(PauseLucide, "Pause");
export const Play = /* @__PURE__ */ axisIcon(PlayLucide, "Play");
export const SkipForward = /* @__PURE__ */ axisIcon(SkipForwardLucide, "SkipForward");
export const Copy = /* @__PURE__ */ axisIcon(CopyLucide, "Copy");
export const DownloadSimple = /* @__PURE__ */ axisIcon(DownloadLucide, "DownloadSimple");
export const Archive = /* @__PURE__ */ axisIcon(ArchiveLucide, "Archive");
export const Globe = /* @__PURE__ */ axisIcon(GlobeLucide, "Globe");
export const ArrowSquareOut = /* @__PURE__ */ axisIcon(ExternalLinkLucide, "ArrowSquareOut");
export const Tray = Inbox;

// Feedback e estado
export const CheckCircle = /* @__PURE__ */ axisIcon(CircleCheckLucide, "CheckCircle");
export const Warning = /* @__PURE__ */ axisIcon(TriangleAlertLucide, "Warning");
export const WarningOctagon = /* @__PURE__ */ axisIcon(OctagonAlertLucide, "WarningOctagon");
export const Info = /* @__PURE__ */ axisIcon(InfoLucide, "Info");
export const CircleNotch = /* @__PURE__ */ axisIcon(LoaderCircleLucide, "CircleNotch");
export const Eye = /* @__PURE__ */ axisIcon(EyeLucide, "Eye");
export const EyeSlash = /* @__PURE__ */ axisIcon(EyeOffLucide, "EyeSlash");
export const ChartBar = /* @__PURE__ */ axisIcon(ChartBarLucide, "ChartBar");
export const ClockCountdown = /* @__PURE__ */ axisIcon(TimerLucide, "ClockCountdown");
export const ChartLineUp = /* @__PURE__ */ axisIcon(ChartLineLucide, "ChartLineUp");
export const Lightbulb = /* @__PURE__ */ axisIcon(LightbulbLucide, "Lightbulb");

// Tema e conversa
export const Sun = /* @__PURE__ */ axisIcon(SunLucide, "Sun");
export const Moon = /* @__PURE__ */ axisIcon(MoonLucide, "Moon");
export const MonitorPlay = /* @__PURE__ */ axisIcon(MonitorPlayLucide, "MonitorPlay");
export const ChatCircle = /* @__PURE__ */ axisIcon(MessageCircleLucide, "ChatCircle");
export const Phone = /* @__PURE__ */ axisIcon(PhoneLucide, "Phone");
export const PhoneIncoming = /* @__PURE__ */ axisIcon(PhoneIncomingLucide, "PhoneIncoming");
export const PhoneOutgoing = /* @__PURE__ */ axisIcon(PhoneOutgoingLucide, "PhoneOutgoing");
export const PhoneX = /* @__PURE__ */ axisIcon(PhoneOffLucide, "PhoneX");
export const Paperclip = /* @__PURE__ */ axisIcon(PaperclipLucide, "Paperclip");
export const Microphone = /* @__PURE__ */ axisIcon(MicLucide, "Microphone");
export const MicrophoneSlash = /* @__PURE__ */ axisIcon(MicOffLucide, "MicrophoneSlash");
export const ImageIcon = /* @__PURE__ */ axisIcon(ImageLucide, "ImageIcon");
export const ImageSquare = /* @__PURE__ */ axisIcon(ImagesLucide, "ImageSquare");
export const MusicNote = /* @__PURE__ */ axisIcon(MusicLucide, "MusicNote");
export const Note = /* @__PURE__ */ axisIcon(StickyNoteLucide, "Note");
export const FileText = /* @__PURE__ */ axisIcon(FileTextLucide, "FileText");
export const Lock = /* @__PURE__ */ axisIcon(LockLucide, "Lock");
export const LockOpen = /* @__PURE__ */ axisIcon(LockOpenLucide, "LockOpen");
export const Receipt = /* @__PURE__ */ axisIcon(ReceiptLucide, "Receipt");
export const Tag = /* @__PURE__ */ axisIcon(TagLucide, "Tag");
export const Question = /* @__PURE__ */ axisIcon(CircleHelpLucide, "Question");
export const Keyboard = /* @__PURE__ */ axisIcon(KeyboardLucide, "Keyboard");

// Fluxos e utilitários
export const GitBranch = /* @__PURE__ */ axisIcon(GitBranchLucide, "GitBranch");
export const Flag = /* @__PURE__ */ axisIcon(FlagLucide, "Flag");
export const TreeStructure = /* @__PURE__ */ axisIcon(NetworkLucide, "TreeStructure");
export const DotsThree = /* @__PURE__ */ axisIcon(EllipsisLucide, "DotsThree");
export const CaretDown = /* @__PURE__ */ axisIcon(ChevronDownLucide, "CaretDown");
export const CaretUp = /* @__PURE__ */ axisIcon(ChevronUpLucide, "CaretUp");
export const CaretDoubleLeft = /* @__PURE__ */ axisIcon(ChevronsLeftLucide, "CaretDoubleLeft");
export const CaretDoubleRight = /* @__PURE__ */ axisIcon(ChevronsRightLucide, "CaretDoubleRight");
export const CaretLeft = /* @__PURE__ */ axisIcon(ChevronLeftLucide, "CaretLeft");
export const CaretRight = /* @__PURE__ */ axisIcon(ChevronRightLucide, "CaretRight");
export const SignOut = /* @__PURE__ */ axisIcon(LogOutLucide, "SignOut");
export const WebhooksLogo = /* @__PURE__ */ axisIcon(WebhookLucide, "WebhooksLogo");
export const PuzzlePiece = /* @__PURE__ */ axisIcon(PuzzleLucide, "PuzzlePiece");
export const UploadSimple = /* @__PURE__ */ axisIcon(UploadLucide, "UploadSimple");
export const Signpost = /* @__PURE__ */ axisIcon(SignpostLucide, "Signpost");
export const ArrowCircleUp = /* @__PURE__ */ axisIcon(CircleArrowUpLucide, "ArrowCircleUp");
export const Funnel = /* @__PURE__ */ axisIcon(FunnelLucide, "Funnel");
export const BookOpen = /* @__PURE__ */ axisIcon(BookOpenLucide, "BookOpen");
export const Key = /* @__PURE__ */ axisIcon(KeyRoundLucide, "Key");
export const UserCircle = /* @__PURE__ */ axisIcon(CircleUserRoundLucide, "UserCircle");
export const ClockCounterClockwise = /* @__PURE__ */ axisIcon(
  HistoryLucide,
  "ClockCounterClockwise",
);
export const IdentificationCard = /* @__PURE__ */ axisIcon(
  ContactRoundLucide,
  "IdentificationCard",
);
export const CalendarBlank = /* @__PURE__ */ axisIcon(CalendarLucide, "CalendarBlank");
export const CalendarDots = /* @__PURE__ */ axisIcon(CalendarDaysLucide, "CalendarDots");
export const CalendarPlus = /* @__PURE__ */ axisIcon(CalendarPlusLucide, "CalendarPlus");
export const CalendarX = /* @__PURE__ */ axisIcon(CalendarXLucide, "CalendarX");
export const CalendarCheck = /* @__PURE__ */ axisIcon(CalendarCheckLucide, "CalendarCheck");
export const MapPin = /* @__PURE__ */ axisIcon(MapPinLucide, "MapPin");
export const ArrowsOutSimple = /* @__PURE__ */ axisIcon(ExpandLucide, "ArrowsOutSimple");
export const Stack = /* @__PURE__ */ axisIcon(LayersLucide, "Stack");

// Nomes Lucide usados por componentes shadcn e superfícies recentes.
export const Search = MagnifyingGlass;
export const RefreshCw = ArrowsClockwise;
export const Loader2 = CircleNotch;
export const CheckCircle2 = CheckCircle;
export const TriangleAlert = Warning;
export const KeyRound = Key;
export const HelpCircle = Question;
export const MessageSquare = /* @__PURE__ */ axisIcon(MessageSquareLucide, "MessageSquare");
export const Package = /* @__PURE__ */ axisIcon(PackageLucide, "Package");
export const Trash2 = Trash;
export const ChevronDown = CaretDown;
export const ChevronUp = CaretUp;
export const ChevronRight = CaretRight;
export const Circle = /* @__PURE__ */ axisIcon(CircleLucide, "Circle");

// videochamada (#2440): ícone de câmera, não logo de marca — junto do Phone
// do DialButton, a família é a mesma.
export const VideoCamera = /* @__PURE__ */ axisIcon(VideoLucide, "VideoCamera");
