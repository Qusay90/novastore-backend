export type StudioChannel = 'web' | 'android';
export interface StudioScope { tenantId: string; storeId: string }
export interface StudioRequest { contractVersion: 'novastore-studio-host/1'; scope: StudioScope; actor: { id: string }; channel: StudioChannel }
export interface StudioVectorNode { tag: 'g' | 'path' | 'circle' | 'ellipse' | 'rect' | 'line' | 'polyline' | 'polygon' | 'title' | 'desc'; attrs: Record<string,string>; children?: StudioVectorNode[]; text?: string }
/** Revalidate with shared visual-assets.js; raw SVG/HTML/JS is never accepted. */
export type StudioVisualAsset = {kind:'svg';viewBox:string;attrs:Record<string,string>;nodes:StudioVectorNode[]} | {kind:'image';src:string;alt:string};
export type StudioAnimationName = 'none'|'recommended'|'pulse'|'float'|'spin'|'bounce'|'shake'|'swing'|'tada'|'heartbeat'|'fade'|'glow'|'wiggle'|'jello'|'rubber-band'|'flip'|'fade-up'|'slide-up'|'fade-down'|'slide-down'|'fade-left'|'slide-left'|'fade-right'|'slide-right'|'zoom-in'|'zoom-out'|'pop-up'|'pop-down'|'rotate-in-left'|'rotate-in-right'|'spin-reverse'|'quarter-left'|'quarter-right'|'half-twist'|'flip-x'|'flip-left'|'flip-right'|'flip-up'|'flip-down'|'nod'|'tilt-left'|'tilt-right'|'rock'|'pendulum'|'shake-y'|'jitter'|'tremble'|'stamp'|'wave'|'bounce-left'|'bounce-right'|'hop'|'drop-rebound'|'boing'|'breathe'|'beacon'|'flash'|'ping'|'soft-glow'|'wipe-right'|'wipe-down'|'reveal-center'|'focus'|'wipe-diagonal'|'orbit'|'orbit-reverse';
export interface StudioAnimationTiming { duration:number; iterations?:'infinite'|number;delay?:number;trigger?:'always'|'click'|'hover'|'page-load'|'route-change'|'product-enter'|'interval';interval?:number }
/** Recommended motion must reference a known catalog icon; all ranges are revalidated at runtime. */
export type StudioAnimation = StudioAnimationTiming & ({name:'recommended';iconId:string}|{name:Exclude<StudioAnimationName,'recommended'>;iconId?:never});
export interface StudioDecorationBase { asset:StudioVisualAsset; size:number; gap:number; offsetX:number; offsetY:number; animation?:StudioAnimation }
/** Maximum eight per anchor; unique overlay IDs; at most one before and one after. */
export type StudioDecoration = StudioDecorationBase & ({placement:'before'|'after'}|{placement:'overlay';id:string;x:number;y:number});
export interface StudioVisualElement { id:string; desktop:Record<string,unknown>;tablet:Record<string,unknown>;mobile:Record<string,unknown>;content?:Record<string,string>;visual?:{asset:StudioVisualAsset;size:number};animation?:StudioAnimation;decorations?:StudioDecoration[] }
/** Existing validated Studio v4 document. Visual metadata is presentation only, never commerce records. */
export interface StudioDocument { blocks: unknown[]; pages: unknown[]; menus: unknown[]; theme: Record<string, unknown>; chrome: Record<string, unknown>; templates: Record<string, unknown>; design?:{name:string;blank:boolean;header:boolean;footer:boolean;navigation:boolean;elements:StudioVisualElement[]}; [key: string]: unknown }
export interface DraftEnvelope { scope: StudioScope; channel: StudioChannel; revision: string; draft: StudioDocument; published: StudioDocument }
/** Immutable trusted renderer identity supplied by the server, never by an editable document. */
export interface StudioPresentation { id:string; version:string; digest:string }
export interface HostConfiguration {
  mode: 'admin' | 'seller' | 'seller-preview';
  readOnly?: boolean;
  availableChannels: StudioChannel[];
  policy: Record<string,{state:'HIDDEN'|'READ_ONLY'|'EDITABLE'|'MANAGE'|'PUBLISH';reason?:string}>;
  assetURLs?: Record<string,string>;
  themeVersions?: Partial<Record<StudioChannel,string>>;
  presentation?: StudioPresentation | null;
  presentations?: Partial<Record<StudioChannel,StudioPresentation | null>>;
  activeChannel?: StudioChannel;
  renderOnly?: boolean;
  externalShell?: boolean;
  initialSection?: string;
  pageKey?: string;
  moduleURL: string;
  scope: StudioScope;
  actor: { id: string; name?: string };
  storeName?: string;
  capabilities: { read: boolean; edit?: boolean; preview?: boolean; scheduledPreview?: boolean; publish?: boolean };
  ports: {
    mountPreviewFrame?(frame:HTMLIFrameElement,url:string):Promise<void>;
    uploadAsset?(bytesBase64:string):Promise<string>;
    loadProduct?(request:{channel:StudioChannel;productId:number}):Promise<unknown>;
    quote?(request:{channel:StudioChannel;body:unknown}):Promise<unknown>;
    readDraft(request: StudioRequest): Promise<DraftEnvelope>;
    readCatalog?(request: StudioRequest): Promise<{ scope: StudioScope; channel: StudioChannel; products: unknown[]; categories: unknown[] }>;
    saveDraft?(request: StudioRequest & { expectedRevision: string; document: StudioDocument; idempotencyKey: string }): Promise<DraftEnvelope>;
    createPreview?(request: StudioRequest & { revision: string; document: StudioDocument; pageKey: string; published: boolean; previewAt?: string }): Promise<{ scope: StudioScope; channel: StudioChannel; url: string; previewAt?: string }>;
    readReadiness?(request: StudioRequest & { revision: string }): Promise<{ scope: StudioScope; channel: StudioChannel; revision: string; ready: boolean; commerce: { contractVersion: 'novastore-theme-host/1'; ready: boolean; scope: StudioScope } }>;
    requestPublication?(request: StudioRequest & { expectedRevision: string; note: string; idempotencyKey: string }): Promise<{ scope: StudioScope; channel: StudioChannel; status: 'requested'; requestId: string }>;
    /** Mount the configured real sector workshop, not a raw localStorage demo link. */
    openThemeWorkshop?(request: { contractVersion: 'novastore-gallery-host/1'; scope: StudioScope; actor: {id: string}; themeId: string; channel: 'web' | 'app' }): Promise<{ scope: StudioScope; sourceVersion: string; status: 'ready' }>;
  };
}
export declare function mountNovaStoreStudio(container: HTMLElement, configuration: HostConfiguration): {
  frame: HTMLIFrameElement;
  ready: Promise<{ contractVersion: 'novastore-studio-host/1'; scope: StudioScope }>;
  getState(): unknown;
  unmount(): void;
};
