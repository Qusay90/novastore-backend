# NovaStore AI Sales and Support Assistant

## 0. Scope and assumptions

This document designs an AI assistant for the floating chat widget already used in NovaStore.

Current project fit:

- Customer widget exists in [frontend/chat.js](C:/Users/kusay/OneDrive/Desktop/NovaStore-App/frontend/chat.js)
- Human chat storage exists in [controllers/messageController.js](C:/Users/kusay/OneDrive/Desktop/NovaStore-App/controllers/messageController.js)
- Product data comes from [controllers/productController.js](C:/Users/kusay/OneDrive/Desktop/NovaStore-App/controllers/productController.js)
- Reviews come from [controllers/reviewController.js](C:/Users/kusay/OneDrive/Desktop/NovaStore-App/controllers/reviewController.js)
- Campaign/pricing quote exists in [controllers/campaignController.js](C:/Users/kusay/OneDrive/Desktop/NovaStore-App/controllers/campaignController.js)
- Commerce tables already include payments, shipments, returns, order events and invoices in [models/createCommerceDb.js](C:/Users/kusay/OneDrive/Desktop/NovaStore-App/models/createCommerceDb.js)

Assumptions:

- The first rollout is Turkish-first.
- The assistant must answer using live catalog and policy data, not static prompt-only memory.
- The site will keep human support as fallback and escalation target.
- Variable data such as stock, price, campaign and shipment ETA must come from tools, not model memory.

Non-goal:

- This is not a generic FAQ bot.
- This is not an ungrounded "LLM answers everything" design.
- This is not a fully autonomous checkout agent.

---

## A) Recommended full architecture

### A.1 High-level system

Use an `AI-first, tool-grounded, human-escalatable` architecture.

Flow:

1. Customer opens existing chat widget.
2. Widget sends message to `POST /api/assistant/chat`.
3. Assistant Orchestrator classifies intent:
   - product discovery
   - comparison
   - support/policy
   - order/payment/shipping help
   - escalation request
4. Orchestrator calls tools and retrieval services.
5. LLM generates a grounded response from returned data only.
6. Response is streamed back to widget.
7. If confidence is low or user asks for a human, conversation is escalated to existing manual support.

### A.2 Proposed backend modules

Add these modules:

- `routes/assistantRoutes.js`
- `controllers/assistantController.js`
- `services/assistantOrchestrator.js`
- `services/catalogSearchService.js`
- `services/retrievalIndexService.js`
- `services/policyService.js`
- `services/reviewInsightService.js`
- `services/conversationStateService.js`
- `services/escalationService.js`
- `services/assistantTelemetryService.js`
- `constants/assistantIntents.js`

### A.3 Runtime layers

Layer 1: Presentation

- Existing chat FAB and window in `frontend/chat.js`
- Add streaming UI states: typing, citations, quick actions, escalation button

Layer 2: API gateway

- `/api/assistant/chat`
- `/api/assistant/suggest`
- `/api/assistant/feedback`
- `/api/assistant/escalate`

Layer 3: Orchestration

- intent detection
- tool planning
- retrieval pipeline
- response assembly
- fallback routing

Layer 4: Tool layer

- product search
- product detail lookup
- compare products
- summarize reviews
- campaign quote
- policy/FAQ lookup
- order support lookup
- escalation to human support

Layer 5: Data layer

- PostgreSQL transactional data
- policy documents and FAQ corpus
- embedding index for semantic retrieval
- optional cache layer

### A.4 Architecture choice

Recommended production architecture:

- LLM orchestration with function calling
- hybrid search: structured SQL + keyword + vector retrieval
- RAG only for unstructured content
- direct SQL/tool lookups for dynamic commercial facts

Why:

- price/stock/shipping facts must be exact
- product matching needs filters, not only embeddings
- policy answers need retrieval over controlled documents
- review summarization needs aggregation over real review rows

### A.5 Performance targets

- first token under `1.2s` for simple FAQ
- full response under `2.5s` p95 for catalog queries
- under `4s` p95 for comparison + review summary
- zero hallucinated price/stock values by policy

---

## B) Which data comes from where

### B.1 Live structured data

Use direct DB-backed tools for:

- products
- categories
- product media
- prices
- old prices
- stock
- review counts
- average ratings
- campaigns and coupons
- orders
- payments
- shipments
- returns
- invoices

Current sources in this project:

- `products`, `product_media`, `reviews`
- `coupons`, `campaign_configs`
- `orders`, `payments`, `shipments`, `returns`, `invoices`, `order_events`

### B.2 Unstructured or semi-structured data

Create a policy corpus for:

- shipping policy
- return policy
- privacy policy
- KVKK text
- payment FAQ
- delivery FAQ
- size/color/use-case guidance
- support scripts

Store them as:

- Markdown files in `docs/policies/*.md`, or
- CMS-managed HTML/text blocks converted to normalized plain text

### B.3 Review and sentiment data

Source:

- `reviews` table + joined product info

Derived features to compute:

- sentiment summary
- top praised topics
- top complaint topics
- count of positive vs neutral vs negative mentions
- confidence score based on review volume

### B.4 Freshness strategy

Do not rely on embeddings alone for mutable data.

Rules:

- price, stock, active campaign, ETA, shipment status, order state:
  - always from live tool call
- product description, usage fit, category context, FAQ:
  - from retrieval index
- reviews:
  - live query plus cached summary with short TTL

### B.5 Auto-update ingestion

When these events happen, refresh assistant knowledge:

- product create/update/delete
- review create
- coupon create/update/delete
- campaign config update
- policy doc update

Implementation:

- after product/review/campaign controller success, publish an `assistant_knowledge_refresh` event
- a background worker updates the retrieval index

---

## C) System prompt

Use this as the production system prompt base.

```text
You are NovaStore AI, a sales and support assistant for an e-commerce site.

Your goals:
- help the customer find the right product quickly
- reduce decision friction
- answer support questions accurately
- use live site data when facts may change
- never invent price, stock, campaign, shipment or policy details
- be helpful, natural, concise and trustworthy

Your style:
- warm, calm, professional
- not robotic
- short answer for short question
- deeper answer when the customer is comparing, uncertain or asking technical detail
- never push aggressively
- never use fake urgency

Behavior rules:
- first understand intent
- if needed, ask only one short clarifying question
- when recommending a product, explain why it fits
- prefer the most relevant 2-4 options first
- if there is no perfect match, offer the closest alternatives and say why
- when comparing products, stay neutral and practical
- when using reviews, summarize recurring themes instead of quoting random lines as facts
- if confidence is low, say what is uncertain
- if the customer needs account-specific help beyond your tools, offer human support escalation

Truth policy:
- stock, price, campaign, delivery time, order state and policy details must come from tools
- if tool data is missing or stale, say so explicitly
- do not guess

Conversion policy:
- your job is to help the customer make a good decision, not to pressure them
- highlight value, fit, tradeoffs, review patterns, return convenience and relevant trust signals
- when appropriate, suggest a next step such as:
  - view product
  - compare two products
  - add to cart
  - check delivery
  - talk to a human

Output rules:
- keep answers readable
- use bullets only when listing products or comparison points
- if linking products, return direct site URLs
- if recommending products, include why each one fits
```

---

## D) Tool / function calling structure

### D.1 Required tool set

#### `search_products`

Purpose:

- find relevant products with structured filtering

Input:

```json
{
  "query": "kablosuz mouse ofis icin",
  "category": "aksesuar",
  "min_price": 0,
  "max_price": 2000,
  "in_stock_only": true,
  "min_rating": 4,
  "sort": "relevance",
  "limit": 5
}
```

Output:

- product id
- name
- category
- price
- old_price
- stock
- average_rating
- review_count
- short_description
- product_url
- image_url
- why_matched fields

#### `get_product_details`

Purpose:

- exact product detail and feature retrieval

Input:

```json
{
  "product_id": 11
}
```

Output:

- all product fields
- media
- normalized feature map
- category path
- stock
- rating summary
- product_url

#### `compare_products`

Purpose:

- structured comparison between 2-4 products

Input:

```json
{
  "product_ids": [11, 15, 22],
  "criteria": ["price", "stock", "rating", "use_case", "feature_fit"]
}
```

Output:

- normalized comparison table
- best_for summary per product
- key tradeoffs

#### `summarize_reviews`

Purpose:

- trustworthy review synthesis

Input:

```json
{
  "product_id": 11,
  "max_reviews": 100
}
```

Output:

- average rating
- review count
- recurring pros
- recurring cons
- notable cautions
- confidence score

#### `get_campaign_quote`

Purpose:

- accurate price and campaign calculation

Use existing quote logic from current project.

Input:

```json
{
  "cart_items": [
    { "id": 11, "quantity": 1 },
    { "id": 15, "quantity": 2 }
  ],
  "coupon_code": "NOVA10"
}
```

Output:

- totals
- shipping
- discounts
- applied campaigns
- coupon validity

#### `get_policy`

Purpose:

- retrieve verified policy answers

Input:

```json
{
  "topic": "iade"
}
```

Output:

- title
- answer summary
- authoritative source section ids
- last_updated_at

#### `get_order_support_info`

Purpose:

- authenticated account-specific support

Input:

```json
{
  "order_id": 120
}
```

Output:

- order status
- payment status
- shipment provider
- tracking number
- shipment ETA
- cancellation/refund state

#### `escalate_to_human`

Purpose:

- route customer to current manual support system

Input:

```json
{
  "reason": "customer wants manual support",
  "summary": "Customer is asking about delayed shipment and wants a human.",
  "conversation_excerpt": ["..."]
}
```

Output:

- ticket or conversation id
- escalation status
- next step for user

### D.2 Tool calling policy

The model must:

- call tools before answering mutable commercial facts
- avoid multiple expensive tools unless needed
- prefer `search_products` before `get_product_details`
- use `compare_products` only after shortlist exists
- use `summarize_reviews` when user asks trust/quality questions
- escalate when policy or emotional state requires human handling

---

## E) Product search logic

### E.1 Search stack

Use a three-stage hybrid pipeline.

Stage 1: Candidate generation

- SQL filter search on structured attributes
- keyword search on `name`, `description`, `category`
- vector search on product text embeddings

Stage 2: Merge and rerank

- combine structured hits + BM25 hits + vector hits
- rerank with:
  - query-product semantic relevance
  - category fit
  - in-stock priority
  - rating/review confidence
  - business rules

Stage 3: Response shaping

- return 2-5 products
- attach short "why this fits" explanation
- attach direct product link

### E.2 Recommended product document for embeddings

Each product document should include:

- name
- category
- description
- keywords
- use cases
- synonyms
- common user intents
- color/size/variant text
- review summary tags

Example indexed text:

```text
Product: Kablosuz Ergonomik Mouse
Category: Aksesuar > Mouse
Use cases: ofis, uzun sureli kullanim, sessiz tiklama, laptop ile tasima
Key features: kablosuz, hafif, ergonomik tutus, sessiz tuslar
Not ideal for: profesyonel oyuncu kullanimi
```

### E.3 Sort and intent handling

Map user intents:

- "en iyi" -> best overall fit, not only highest price
- "fiyat performans" -> fit score with strong value weighting
- "en ucuz" -> lowest price among acceptable quality
- "en cok tercih edilen" -> review count + rating + recent demand
- "alternatif" -> same use case, different price band

### E.4 SQL recommendation

Add a dedicated search endpoint:

- `GET /api/products/search`

Suggested query params:

- `q`
- `category`
- `minPrice`
- `maxPrice`
- `inStock`
- `minRating`
- `sort`
- `limit`

---

## F) Review summarization logic

### F.1 Summary method

Do not ask the LLM to summarize raw review text without preprocessing.

Pipeline:

1. fetch recent and relevant reviews
2. remove duplicates and spam-like rows
3. extract aspect mentions:
   - quality
   - price/value
   - comfort
   - durability
   - delivery/packaging
   - ease of use
4. compute frequency and sentiment per aspect
5. send structured aspect summary to LLM
6. LLM produces a concise human-readable summary

### F.2 Output template

When user asks "Kullananlar memnun mu?":

- overall sentiment
- most praised 2-3 points
- most common concern 1-2 points
- confidence note based on review count

Example response pattern:

```text
Genel tablo olumlu. Kullananlar en cok X ve Y tarafini begenmis gorunuyor.
En sik gelen cekince ise Z konusu. Yorum sayisi yuksek oldugu icin bu ozet orta-yuksek guvenle soylenebilir.
```

### F.3 Guardrails

- do not present one-off comments as consensus
- if review volume is low, say "yorum sayisi sinirli"
- separate product issues from shipping issues

---

## G) Ethical conversion strategy

### G.1 Core principle

The assistant must reduce friction, not manipulate.

Good behavior:

- clarify need
- recommend a small shortlist
- explain fit in customer language
- mention tradeoffs
- use trust signals honestly
- suggest a next step

Bad behavior:

- fake urgency
- invented scarcity
- saying "best" without basis
- pushing an expensive product when a cheaper one fits

### G.2 Recommended response pattern

For sales-oriented questions use this structure:

1. reflect need briefly
2. give best-fit options first
3. explain why each fits
4. mention one important tradeoff if needed
5. give a light CTA

Example:

```text
Ofis kullanimi ve sessiz tiklama istiyorsan su iki model daha mantikli:
- X: daha rahat uzun kullanim icin uygun
- Y: daha uygun fiyatli ama yine sessiz

Eger istersen ikisini 3 maddede karsilastirayim ya da direkt urun linklerini vereyim.
```

### G.3 Trust levers the assistant may use

- review count
- rating summary
- return convenience
- in-stock confirmation
- value-for-money fit
- feature match to the user need

---

## H) Example user questions and high-quality answers

### H.1 Product search

User:

```text
Bana 2000 TL altinda ofis icin rahat bir mouse bul.
```

Assistant:

```text
Ofis kullanimi icin 2000 TL altinda en uygun secenekler bunlar:

- Ergonomik Kablosuz Mouse X
  Neden uygun: uzun sureli kullanimda eli daha az yoracak ergonomik yapida, kablosuz ve fiyat limiti icinde.

- Sessiz Tiklamali Mouse Y
  Neden uygun: acik ofis veya ev-ofis icin sessiz tuslariyla daha konforlu, fiyat olarak daha ekonomik.

Istersen bunlari konfor, pil omru ve fiyat-performans acisindan da karsilastirayim.
```

### H.2 Comparison

User:

```text
Bu iki urun arasinda hangisi daha mantikli?
```

Assistant:

```text
Kisa ozetle:

- Daha rahat ve uzun sureli kullanim istiyorsan: Urun A
- Daha uygun butce istiyorsan: Urun B

Urun A ergonomi tarafinda daha guclu gorunuyor. Urun B ise temel ihtiyaci daha uygun fiyata karsiliyor.
Eger gunde uzun saatler kullanacaksan A daha mantikli, ara sira kullanim icinse B yeterli olabilir.
```

### H.3 Review trust question

User:

```text
Kullananlar en cok neyini begenmis?
```

Assistant:

```text
Yorumlarda en cok iki nokta one cikiyor:

- kullanim rahatligi
- fiyatina gore verdigi performans

En sik cekince ise dayaniklilik beklentisinin kullaniciya gore degismesi. Yorum sayisi yeterli oldugu icin bu ozet makul guvenle soylenebilir.
```

### H.4 Policy

User:

```text
Iade sureci nasil?
```

Assistant:

```text
Iade konusunda size net bilgi vereyim: teslimden sonra belirlenen iade suresi icinde talep olusturabiliyorsunuz. Kullanilmis veya tekrar satilamaz durumdaki urunlerde iade kosulu degisebilir.

Isterseniz size iade adimlarini 3 maddede siralayayim ya da ilgili politika metnini acayim.
```

### H.5 Uncertain case

User:

```text
Bu urun yarin kesin gelir mi?
```

Assistant:

```text
Kesin soz vermem dogru olmaz. Teslim suresi stok, kargo cikisi ve adres bolgesine gore degisebilir.
Canli teslimat tahmini varsa onu kontrol edip en guncel bilgiyi verebilirim.
```

### H.6 Escalation

User:

```text
Ben bir temsilciyle goruseyim.
```

Assistant:

```text
Elbette. Konuyu kisaca ozetleyip destek ekibine aktarabilirim. Boylece tekrar bastan anlatmaniz gerekmez.
```

---

## I) Error handling and fallback logic

### I.1 Low confidence

If search confidence is low:

- say the match is approximate
- ask one clarifying question
- provide closest alternatives

### I.2 Tool failure

If a tool fails:

- do not fabricate
- say the exact data is temporarily unavailable
- give only safe general guidance
- offer retry or human support

### I.3 Missing data

If stock or price is missing:

- say it could not be confirmed live
- do not mention a value

### I.4 No suitable products

If nothing fits:

- say there is no exact match
- provide nearest alternatives
- suggest relaxing one filter

### I.5 Escalation triggers

Escalate automatically when:

- angry or frustrated customer
- refund/dispute edge case
- payment failure with account-specific detail
- missing operational certainty
- repeated misunderstandings
- customer explicitly asks for human

---

## J) Real project implementation flow

### J.1 Phase 1 - Safe MVP

Goal:

- AI answers catalog and support questions
- human support remains fallback

Implementation:

1. Add `POST /api/assistant/chat`
2. Keep `frontend/chat.js` widget shell, but send messages to assistant API
3. Add tools:
   - `search_products`
   - `get_product_details`
   - `summarize_reviews`
   - `get_policy`
   - `get_campaign_quote`
   - `escalate_to_human`
4. Return:
   - text
   - product suggestions
   - link actions
   - escalation availability

### J.2 Phase 2 - Better retrieval and personalization

Add:

- hybrid search index
- review aspect summaries
- recent browsing/cart context
- order support tool for authenticated users

### J.3 Phase 3 - Conversion optimization

Add:

- intent-specific reply templates
- A/B testing on suggestion style
- smart follow-up suggestions
- richer comparison cards
- event tracking for:
  - product clicks
  - add-to-cart after AI
  - escalation rate
  - unresolved sessions

---

## Suggested API contract

### `POST /api/assistant/chat`

Request:

```json
{
  "session_id": "uuid",
  "message": "2000 TL altinda ofis mouse oner",
  "page_context": {
    "page_type": "product",
    "product_id": 11
  },
  "customer_context": {
    "user_id": 5,
    "is_authenticated": true,
    "cart_items": [{ "id": 11, "quantity": 1 }]
  }
}
```

Response:

```json
{
  "answer": "Ofis kullanimi icin en uygun iki secenek bunlar...",
  "cards": [
    {
      "type": "product",
      "product_id": 11,
      "title": "Ergonomik Mouse X",
      "price": 899.9,
      "url": "/product.html?id=11",
      "reason": "Uzun kullanim icin daha rahat."
    }
  ],
  "follow_up_suggestions": [
    "Karsilastir",
    "Yorumlari ozetle",
    "Sepete uygun alternatif bul"
  ],
  "confidence": 0.91,
  "escalation_available": true
}
```

---

## Recommended conversation manager logic

Use a small state machine:

- `DISCOVER`
- `CLARIFY`
- `SHORTLIST`
- `COMPARE`
- `TRUST_BUILD`
- `CLOSE`
- `ESCALATE`

This prevents chaotic responses and keeps the assistant commercially useful.

---

## Recommended telemetry

Track these:

- intent distribution
- tool call count per chat
- tool failure rate
- zero-result search rate
- product click-through after AI
- add-to-cart after AI
- human escalation rate
- answer latency p50/p95
- customer thumbs up/down

---

## What should be built first in this project

Priority order for NovaStore:

1. `POST /api/assistant/chat`
2. product search tool
3. product detail tool
4. review summary tool
5. policy retrieval
6. escalation to existing support messages
7. hybrid search index
8. campaign quote integration
9. authenticated order support tool

---

## Final recommendation

For NovaStore, the best system is:

- `tool-grounded assistant`
- `hybrid product retrieval`
- `strict live lookup for mutable facts`
- `review insight summarization`
- `AI-first, human-fallback chat flow`

This gives the best balance of:

- accuracy
- freshness
- low latency
- conversion support
- operational safety
- realistic implementation effort in the current codebase
