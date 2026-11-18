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
  CircleStop as CircleStopLucide,
  SquareCheck as SquareCheckLucide,
  Hourglass as HourglassLucide,
  Minus as MinusLucide,
  Zap as ZapLucide,
  CircleArrowUp as CircleArrowUpLucide,
  CircleCheck as CircleCheckLucide,
  CircleHelp as CircleHelpLucide,
  CircleUserRound as CircleUserRoundLucide,
  ClipboardList as ClipboardListLucide,
  Clock as ClockLucide,
  ContactRound as ContactRoundLucide,
  Copy as CopyLucide,
  DollarSign as DollarSignLucide,
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
  Link as LinkLucide,
  ShoppingCart as ShoppingCartLucide,
  Flame as FlameLucide,
  Voicemail as VoicemailLucide,
  AudioWaveform as AudioWaveformLucide,
  CircleX as CircleXLucide,
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

export const Lightning = /* @__PURE__ */ axisIcon(ZapLucide, "Lightning");
export const StopCircle = /* @__PURE__ */ axisIcon(CircleStopLucide, "StopCircle");
export const Minus = /* @__PURE__ */ axisIcon(MinusLucide, "Minus");
export const CheckSquare = /* @__PURE__ */ axisIcon(SquareCheckLucide, "CheckSquare");
export const Hourglass = /* @__PURE__ */ axisIcon(HourglassLucide, "Hourglass");

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
// atalhos do card (#3487): carrinho do app de pedidos e o link genérico.
// `LinkIcon` e não `Link`: `Link` é o do `next/link` em quase toda tela.
export const ShoppingCart = /* @__PURE__ */ axisIcon(ShoppingCartLucide, "ShoppingCart");
export const LinkIcon = /* @__PURE__ */ axisIcon(LinkLucide, "LinkIcon");

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
// cold call (upstream): temperatura do lead, caixa postal, linha ativa, sem interesse
export const Fire = /* @__PURE__ */ axisIcon(FlameLucide, "Fire");
export const Voicemail = /* @__PURE__ */ axisIcon(VoicemailLucide, "Voicemail");
export const Waveform = /* @__PURE__ */ axisIcon(AudioWaveformLucide, "Waveform");
export const XCircle = /* @__PURE__ */ axisIcon(CircleXLucide, "XCircle");
export const Check = /* @__PURE__ */ axisIcon(CheckLucide, "Check");
export const Checks = /* @__PURE__ */ axisIcon(CheckCheckLucide, "Checks");
export const DollarSign = /* @__PURE__ */ axisIcon(DollarSignLucide, "DollarSign");
export const X =/* @__PURE__ */ axisIcon(XLucide, "X");
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
export const CalendarClock = /* @__PURE__ */ axisIcon(CalendarLucide, "CalendarClock");
export const History = ClockCounterClockwise;
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

// Marcas de canais mantêm a forma oficial; os demais ícones seguem o catálogo Axis.
/*
MIT License

Copyright (c) 2020 Phosphor Icons

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
*/
function brandIcon(path: string, name: string): AxisIcon {
  const Component = forwardRef<SVGSVGElement, AxisIconProps>(({ size = "1em", weight: _weight, ...props }, ref) =>
    createElement("svg", { ...props, ref, width: size, height: size, viewBox: "0 0 256 256", fill: "currentColor" }, createElement("path", { d: path })),
  );
  Component.displayName = name;
  return Component;
}
export const WhatsappLogo = brandIcon("M152.58,145.23l23,11.48A24,24,0,0,1,152,176a72.08,72.08,0,0,1-72-72A24,24,0,0,1,99.29,80.46l11.48,23L101,118a8,8,0,0,0-.73,7.51,56.47,56.47,0,0,0,30.15,30.15A8,8,0,0,0,138,155ZM232,128A104,104,0,0,1,79.12,219.82L45.07,231.17a16,16,0,0,1-20.24-20.24l11.35-34.05A104,104,0,1,1,232,128Zm-40,24a8,8,0,0,0-4.42-7.16l-32-16a8,8,0,0,0-8,.5l-14.69,9.8a40.55,40.55,0,0,1-16-16l9.8-14.69a8,8,0,0,0,.5-8l-16-32A8,8,0,0,0,104,64a40,40,0,0,0-40,40,88.1,88.1,0,0,0,88,88A40,40,0,0,0,192,152Z", "WhatsappLogo");
export const InstagramLogo = brandIcon("M176,24H80A56.06,56.06,0,0,0,24,80v96a56.06,56.06,0,0,0,56,56h96a56.06,56.06,0,0,0,56-56V80A56.06,56.06,0,0,0,176,24ZM128,176a48,48,0,1,1,48-48A48.05,48.05,0,0,1,128,176Zm60-96a12,12,0,1,1,12-12A12,12,0,0,1,188,80Zm-28,48a32,32,0,1,1-32-32A32,32,0,0,1,160,128Z", "InstagramLogo");
export const MessengerLogo = brandIcon("M128,24A104,104,0,0,0,36.18,176.88L24.83,210.93a16,16,0,0,0,20.24,20.24l34.05-11.35A104,104,0,1,0,128,24Zm53.66,93.66-32,32a8,8,0,0,1-11.32,0L112,123.31,85.66,149.66a8,8,0,0,1-11.32-11.32l32-32a8,8,0,0,1,11.32,0L144,132.69l26.34-26.35a8,8,0,0,1,11.32,11.32Z", "MessengerLogo");
export const TelegramLogo = brandIcon("M228.88,26.19a9,9,0,0,0-9.16-1.57L17.06,103.93a14.22,14.22,0,0,0,2.43,27.21L72,141.45V200a15.92,15.92,0,0,0,10,14.83,15.91,15.91,0,0,0,17.51-3.73l25.32-26.26L165,220a15.88,15.88,0,0,0,10.51,4,16.3,16.3,0,0,0,5-.79,15.85,15.85,0,0,0,10.67-11.63L231.77,35A9,9,0,0,0,228.88,26.19ZM175.53,208,92.85,135.5l119-85.29Z", "TelegramLogo");
export const GoogleLogo = brandIcon("M128,24A104,104,0,1,0,232,128,104,104,0,0,0,128,24Zm0,184A80,80,0,1,1,181.34,68.37a8,8,0,0,1-10.67,11.92A64,64,0,1,0,191.5,136H128a8,8,0,0,1,0-16h72a8,8,0,0,1,8,8A80.09,80.09,0,0,1,128,208Z", "GoogleLogo");
export const PaintBrush = Palette;
