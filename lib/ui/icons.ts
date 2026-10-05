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
  ChartNoAxesCombined as ChartNoAxesCombinedLucide,
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
  Funnel as FunnelLucide,
  Gauge as GaugeLucide,
  GitBranch as GitBranchLucide,
  Globe as GlobeLucide,
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
  UsersRound as UsersRoundLucide,
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
    ({ weight = "regular", strokeWidth, ...props }, ref) =>
      createElement(Icon, {
        ...props,
        ref,
        fill: "none",
        strokeWidth: axisStrokeWidth(weight, strokeWidth),
      }),
  );
  Component.displayName = displayName;
  return Component;
}

// Navegação e estrutura
export const Inbox = axisIcon(InboxLucide, "Inbox");
export const ListChecks = axisIcon(ListChecksLucide, "ListChecks");
export const Plugs = axisIcon(PlugLucide, "Plugs");
export const PlugsConnected = axisIcon(PlugZapLucide, "PlugsConnected");
export const QrCode = axisIcon(QrCodeLucide, "QrCode");
export const Kanban = axisIcon(KanbanLucide, "Kanban");
export const Users = axisIcon(UsersLucide, "Users");
export const UsersThree = axisIcon(UsersRoundLucide, "UsersThree");
export const Storefront = axisIcon(StoreLucide, "Storefront");
export const Robot = axisIcon(BotLucide, "Robot");
export const Sparkle = axisIcon(SparklesLucide, "Sparkle");
export const ShieldCheck = axisIcon(ShieldCheckLucide, "ShieldCheck");
export const Gear = axisIcon(SettingsLucide, "Gear");
export const House = axisIcon(HouseLucide, "House");
export const Buildings = axisIcon(Building2Lucide, "Buildings");
export const FlowArrow = axisIcon(WorkflowLucide, "FlowArrow");
export const ChatsCircle = axisIcon(MessageCircleMoreLucide, "ChatsCircle");
export const ClipboardText = axisIcon(ClipboardListLucide, "ClipboardText");
export const Scales = axisIcon(ScaleLucide, "Scales");
export const ScalesSimple = Scales;
export const Gauge = axisIcon(GaugeLucide, "Gauge");
export const WifiSlash = axisIcon(WifiOffLucide, "WifiSlash");
export const Clock = axisIcon(ClockLucide, "Clock");
export const Palette = axisIcon(PaletteLucide, "Palette");
export const Megaphone = axisIcon(MegaphoneLucide, "Megaphone");
export const WifiHigh = axisIcon(WifiLucide, "WifiHigh");
export const Brain = axisIcon(BrainLucide, "Brain");
export const ArrowsClockwise = axisIcon(RefreshCwLucide, "ArrowsClockwise");
export const Dot = axisIcon(DotLucide, "Dot");

// Ações
export const ArrowBendUpLeft = axisIcon(ReplyLucide, "ArrowBendUpLeft");
export const ArrowLeft = axisIcon(ArrowLeftLucide, "ArrowLeft");
export const ArrowsLeftRight = axisIcon(ArrowLeftRightLucide, "ArrowsLeftRight");
export const ArrowRight = axisIcon(ArrowRightLucide, "ArrowRight");
export const List = axisIcon(ListLucide, "List");
export const Bell = axisIcon(BellLucide, "Bell");
export const BellSlash = axisIcon(BellOffLucide, "BellSlash");
export const EnvelopeSimple = axisIcon(MailLucide, "EnvelopeSimple");
export const PaperPlaneTilt = axisIcon(SendLucide, "PaperPlaneTilt");
export const Smiley = axisIcon(SmileLucide, "Smiley");
export const Check = axisIcon(CheckLucide, "Check");
export const Checks = axisIcon(CheckCheckLucide, "Checks");
export const X = axisIcon(XLucide, "X");
export const Plus = axisIcon(PlusLucide, "Plus");
export const Trash = axisIcon(Trash2Lucide, "Trash");
export const PencilSimple = axisIcon(PencilLucide, "PencilSimple");
export const MagnifyingGlass = axisIcon(SearchLucide, "MagnifyingGlass");
export const Pause = axisIcon(PauseLucide, "Pause");
export const Play = axisIcon(PlayLucide, "Play");
export const SkipForward = axisIcon(SkipForwardLucide, "SkipForward");
export const Copy = axisIcon(CopyLucide, "Copy");
export const DownloadSimple = axisIcon(DownloadLucide, "DownloadSimple");
export const Archive = axisIcon(ArchiveLucide, "Archive");
export const Globe = axisIcon(GlobeLucide, "Globe");
export const ArrowSquareOut = axisIcon(ExternalLinkLucide, "ArrowSquareOut");
export const Tray = Inbox;

// Feedback e estado
export const CheckCircle = axisIcon(CircleCheckLucide, "CheckCircle");
export const Warning = axisIcon(TriangleAlertLucide, "Warning");
export const WarningOctagon = axisIcon(OctagonAlertLucide, "WarningOctagon");
export const Info = axisIcon(InfoLucide, "Info");
export const CircleNotch = axisIcon(LoaderCircleLucide, "CircleNotch");
export const Eye = axisIcon(EyeLucide, "Eye");
export const EyeSlash = axisIcon(EyeOffLucide, "EyeSlash");
export const ChartBar = axisIcon(ChartBarLucide, "ChartBar");
export const ClockCountdown = axisIcon(TimerLucide, "ClockCountdown");
export const ChartLineUp = axisIcon(ChartNoAxesCombinedLucide, "ChartLineUp");
export const Lightbulb = axisIcon(LightbulbLucide, "Lightbulb");

// Tema e conversa
export const Sun = axisIcon(SunLucide, "Sun");
export const Moon = axisIcon(MoonLucide, "Moon");
export const MonitorPlay = axisIcon(MonitorPlayLucide, "MonitorPlay");
export const ChatCircle = axisIcon(MessageCircleLucide, "ChatCircle");
export const Phone = axisIcon(PhoneLucide, "Phone");
export const PhoneIncoming = axisIcon(PhoneIncomingLucide, "PhoneIncoming");
export const PhoneOutgoing = axisIcon(PhoneOutgoingLucide, "PhoneOutgoing");
export const PhoneX = axisIcon(PhoneOffLucide, "PhoneX");
export const Paperclip = axisIcon(PaperclipLucide, "Paperclip");
export const Microphone = axisIcon(MicLucide, "Microphone");
export const MicrophoneSlash = axisIcon(MicOffLucide, "MicrophoneSlash");
export const ImageIcon = axisIcon(ImageLucide, "ImageIcon");
export const ImageSquare = axisIcon(ImagesLucide, "ImageSquare");
export const MusicNote = axisIcon(MusicLucide, "MusicNote");
export const Note = axisIcon(StickyNoteLucide, "Note");
export const FileText = axisIcon(FileTextLucide, "FileText");
export const Lock = axisIcon(LockLucide, "Lock");
export const LockOpen = axisIcon(LockOpenLucide, "LockOpen");
export const Receipt = axisIcon(ReceiptLucide, "Receipt");
export const Tag = axisIcon(TagLucide, "Tag");
export const Question = axisIcon(CircleHelpLucide, "Question");
export const Keyboard = axisIcon(KeyboardLucide, "Keyboard");

// Fluxos e utilitários
export const GitBranch = axisIcon(GitBranchLucide, "GitBranch");
export const Flag = axisIcon(FlagLucide, "Flag");
export const TreeStructure = axisIcon(NetworkLucide, "TreeStructure");
export const DotsThree = axisIcon(EllipsisLucide, "DotsThree");
export const CaretDown = axisIcon(ChevronDownLucide, "CaretDown");
export const CaretUp = axisIcon(ChevronUpLucide, "CaretUp");
export const CaretDoubleLeft = axisIcon(ChevronsLeftLucide, "CaretDoubleLeft");
export const CaretDoubleRight = axisIcon(ChevronsRightLucide, "CaretDoubleRight");
export const CaretLeft = axisIcon(ChevronLeftLucide, "CaretLeft");
export const CaretRight = axisIcon(ChevronRightLucide, "CaretRight");
export const SignOut = axisIcon(LogOutLucide, "SignOut");
export const WebhooksLogo = axisIcon(WebhookLucide, "WebhooksLogo");
export const PuzzlePiece = axisIcon(PuzzleLucide, "PuzzlePiece");
export const UploadSimple = axisIcon(UploadLucide, "UploadSimple");
export const Signpost = axisIcon(SignpostLucide, "Signpost");
export const ArrowCircleUp = axisIcon(CircleArrowUpLucide, "ArrowCircleUp");
export const Funnel = axisIcon(FunnelLucide, "Funnel");
export const BookOpen = axisIcon(BookOpenLucide, "BookOpen");
export const Key = axisIcon(KeyRoundLucide, "Key");
export const UserCircle = axisIcon(CircleUserRoundLucide, "UserCircle");
export const ClockCounterClockwise = axisIcon(HistoryLucide, "ClockCounterClockwise");
export const IdentificationCard = axisIcon(ContactRoundLucide, "IdentificationCard");
export const CalendarBlank = axisIcon(CalendarLucide, "CalendarBlank");
export const CalendarDots = axisIcon(CalendarDaysLucide, "CalendarDots");
export const CalendarPlus = axisIcon(CalendarPlusLucide, "CalendarPlus");
export const CalendarX = axisIcon(CalendarXLucide, "CalendarX");
export const CalendarCheck = axisIcon(CalendarCheckLucide, "CalendarCheck");
export const MapPin = axisIcon(MapPinLucide, "MapPin");
export const ArrowsOutSimple = axisIcon(ExpandLucide, "ArrowsOutSimple");
export const Stack = axisIcon(LayersLucide, "Stack");

// Nomes Lucide usados por componentes shadcn e superfícies recentes.
export const Search = MagnifyingGlass;
export const RefreshCw = ArrowsClockwise;
export const Loader2 = CircleNotch;
export const CheckCircle2 = CheckCircle;
export const TriangleAlert = Warning;
export const KeyRound = Key;
export const HelpCircle = Question;
export const MessageSquare = axisIcon(MessageSquareLucide, "MessageSquare");
export const Package = axisIcon(PackageLucide, "Package");
export const Trash2 = Trash;
export const ChevronDown = CaretDown;
export const ChevronUp = CaretUp;
export const ChevronRight = CaretRight;
export const Circle = axisIcon(CircleLucide, "Circle");
