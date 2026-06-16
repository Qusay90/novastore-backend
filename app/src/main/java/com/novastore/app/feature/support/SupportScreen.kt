package com.novastore.app.feature.support

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AddShoppingCart
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.CompareArrows
import androidx.compose.material.icons.filled.ErrorOutline
import androidx.compose.material.icons.filled.FavoriteBorder
import androidx.compose.material.icons.filled.Info
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Send
import androidx.compose.material.icons.filled.SupportAgent
import androidx.compose.material3.AssistChip
import androidx.compose.material3.AssistChipDefaults
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TextFieldDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import coil3.compose.AsyncImage
import com.novastore.app.R
import com.novastore.app.data.model.AssistantComparisonRow
import com.novastore.app.data.model.AssistantProduct
import java.text.NumberFormat
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

private val PrimaryBlue = Color(0xFF0D4B7A)
private val DarkBlue = Color(0xFF08365C)
private val OrangeAccent = Color(0xFFF28C18)
private val LightBackground = Color(0xFFF7F8FA)
private val SoftBorder = Color(0xFFE2E8F0)
private val SuccessGreen = Color(0xFF28C76F)

private val screenTurkishLocale = Locale("tr", "TR")

private val screenAsciiTurkishReplacements = listOf(
    "iyiyim" to "iyiyim",
    "iyi" to "iyi",
    "tesekkurler" to "teşekkürler",
    "tesekkur" to "teşekkür",
    "bugun" to "bugün",
    "cok" to "çok",
    "kisaca" to "kısaca",
    "alti" to "altı",
    "altinda" to "altında",
    "ustunde" to "üstünde",
    "ustu" to "üstü",
    "uzeri" to "üzeri",
    "aradiginizi" to "aradığınızı",
    "aradiginiz" to "aradığınız",
    "aradigini" to "aradığını",
    "aradigin" to "aradığın",
    "yazmaniz" to "yazmanız",
    "yazmani" to "yazmanı",
    "yardim" to "yardım",
    "istediginize" to "istediğinize",
    "istedigin" to "istediğin",
    "alisveris" to "alışveriş",
    "yakin" to "yakın",
    "secenekleri" to "seçenekleri",
    "secenek" to "seçenek",
    "toparladim" to "toparladım",
    "toparlayayim" to "toparlayayım",
    "alakali" to "alakalı",
    "urunleri" to "ürünleri",
    "urununu" to "ürününü",
    "urunu" to "ürünü",
    "urunler" to "ürünler",
    "urun" to "ürün",
    "cikardim" to "çıkardım",
    "cikarmak" to "çıkarmak",
    "cikar" to "çıkar",
    "bunlari" to "bunları",
    "karsilastirma" to "karşılaştırma",
    "karsilastir" to "karşılaştır",
    "goster" to "göster",
    "ozetini" to "özetini",
    "ozeti" to "özeti",
    "odeme" to "ödeme",
    "siparis" to "sipariş",
    "canli" to "canlı",
    "destege" to "desteğe",
    "baglan" to "bağlan",
    "baglandi" to "bağlandı",
    "baglaniyor" to "bağlanıyor",
    "baglantini" to "bağlantını",
    "baglanti" to "bağlantı",
    "yardimci" to "yardımcı",
    "olayim" to "olayım",
    "olusturuluyor" to "oluşturuluyor",
    "olusturuldu" to "oluşturuldu",
    "olustur" to "oluştur",
    "butce" to "bütçe",
    "kullanim" to "kullanım",
    "amacini" to "amacını",
    "dogrulanmis" to "doğrulanmış",
    "anlayamadim" to "anlayamadım",
    "mantikli" to "mantıklı",
    "gercek" to "gerçek",
    "hizli" to "hızlı",
    "kisa" to "kısa",
    "musteri" to "müşteri",
    "konusacagim" to "konuşacağım",
    "konus" to "konuş",
    "oner" to "öner",
    "oneri" to "öneri",
    "degisim" to "değişim"
)

private fun displayTurkishText(value: String): String {
    return screenAsciiTurkishReplacements.fold(value) { current, (ascii, turkish) ->
        Regex("\\b${Regex.escape(ascii)}\\b", RegexOption.IGNORE_CASE).replace(current) { match ->
            if (match.value.firstOrNull()?.isUpperCase() == true) {
                turkish.replaceFirstChar { it.titlecase(screenTurkishLocale) }
            } else {
                turkish
            }
        }
    }
}

@Composable
fun SupportScreen(
    modifier: Modifier = Modifier,
    refreshToken: Int = 0,
    onProductClick: (Int) -> Unit = {},
    viewModel: SupportViewModel = hiltViewModel()
) {
    val uiState by viewModel.uiState.collectAsState()
    val listState = rememberLazyListState()
    var isModesExpanded by remember { mutableStateOf(false) }

    LaunchedEffect(refreshToken) {
        if (refreshToken > 0) {
            viewModel.resetConversation()
        }
    }

    LaunchedEffect(uiState.messages.size, uiState.isSending, uiState.isEscalating) {
        val extraTypingRow = if (uiState.isSending || uiState.isEscalating) 1 else 0
        listState.scrollToItem((uiState.messages.size + extraTypingRow - 1).coerceAtLeast(0))
    }

    Column(
        modifier = modifier
            .fillMaxSize()
            .background(LightBackground)
            .imePadding()
    ) {
        SupportChatHeader(
            selectedModeTitle = uiState.selectedModeTitle,
            escalationCreated = uiState.escalationCreated
        )

        Row(
            modifier = Modifier
                .fillMaxWidth()
                .background(Color.White)
                .clickable { isModesExpanded = !isModesExpanded }
                .padding(horizontal = 16.dp, vertical = 10.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.SpaceBetween
        ) {
            Text(
                text = "NovaBot Konuşma Modu: ${uiState.selectedModeTitle}",
                color = DarkBlue,
                fontWeight = FontWeight.ExtraBold,
                fontSize = 13.sp
            )
            Text(
                text = if (isModesExpanded) "Gizle ▲" else "Değiştir ▼",
                color = OrangeAccent,
                fontWeight = FontWeight.ExtraBold,
                fontSize = 13.sp
            )
        }

        if (isModesExpanded) {
            ModeSelector(
                modeOptions = uiState.modeOptions,
                selectedMode = uiState.selectedMode,
                onModeClick = { modeId ->
                    viewModel.selectMode(modeId)
                    isModesExpanded = false
                }
            )
        }

        LazyColumn(
            modifier = Modifier
                .weight(1f)
                .fillMaxWidth(),
            state = listState,
            contentPadding = PaddingValues(horizontal = 16.dp, vertical = 14.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            items(uiState.messages, key = { it.id }) { message ->
                SupportMessageBubble(
                    message = message,
                    onSuggestionClick = { prompt ->
                        if (prompt.equals("Tekrar dene", ignoreCase = true)) {
                            viewModel.retryLastUserMessage()
                        } else {
                            viewModel.sendSuggestion(prompt)
                        }
                    },
                    onEscalate = viewModel::requestLiveSupportConfirmation,
                    onAddToCart = viewModel::requestAddToCart,
                    onProductDetails = { product ->
                        product.id?.let(onProductClick)
                    },
                    onFavorite = viewModel::toggleFavorite,
                    onCompare = viewModel::addToCompare
                )
            }

            if (uiState.isSending || uiState.isEscalating) {
                item(key = "typing") {
                    TypingBubble(
                        text = if (uiState.isEscalating) {
                            "Canlı destek talebi oluşturuluyor..."
                        } else {
                            "NovaBot yazıyor..."
                        }
                    )
                }
            }
        }

        MessageInputBar(
            draft = uiState.draft,
            enabled = !uiState.isSending && !uiState.isEscalating,
            onDraftChange = viewModel::updateDraft,
            onSend = viewModel::sendDraft
        )
    }
}

@Composable
private fun SupportChatHeader(
    selectedModeTitle: String,
    escalationCreated: Boolean
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .height(96.dp)
            .background(DarkBlue)
            .padding(horizontal = 16.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Box(
            modifier = Modifier
                .size(56.dp)
                .clip(CircleShape)
                .background(Color.White),
            contentAlignment = Alignment.Center
        ) {
            Image(
                painter = painterResource(id = R.drawable.support_novastore),
                contentDescription = "NovaBot",
                modifier = Modifier.size(40.dp)
            )
        }
        Spacer(modifier = Modifier.width(12.dp))
        Column(modifier = Modifier.weight(1f)) {
            Text(
                text = "NovaBot",
                color = Color.White,
                fontWeight = FontWeight.ExtraBold,
                fontSize = 20.sp,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis
            )
            Row(verticalAlignment = Alignment.CenterVertically) {
                Box(
                    modifier = Modifier
                        .size(8.dp)
                        .clip(CircleShape)
                        .background(if (escalationCreated) SuccessGreen else OrangeAccent)
                )
                Spacer(modifier = Modifier.width(6.dp))
                Text(
                    text = if (escalationCreated) "Canlı destek ekibinde" else selectedModeTitle,
                    color = Color.White.copy(alpha = 0.82f),
                    style = MaterialTheme.typography.bodySmall,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis
                )
            }
        }
        Icon(Icons.Default.SupportAgent, contentDescription = null, tint = Color.White.copy(alpha = 0.82f))
    }
}

@Composable
private fun ModeSelector(
    modeOptions: List<NovaBotModeOption>,
    selectedMode: String,
    onModeClick: (String) -> Unit
) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .background(Color.White)
            .padding(horizontal = 16.dp, vertical = 12.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp)
    ) {
        Text(
            text = "NovaBot seninle nasıl konuşsun?",
            color = DarkBlue,
            fontWeight = FontWeight.ExtraBold,
            fontSize = 15.sp
        )
        Text(
            text = "İstersen ciddi, istersen samimi, istersen eğlenceli bir alışveriş asistanı gibi konuşabilirim.",
            color = Color(0xFF64748B),
            fontSize = 12.sp,
            lineHeight = 16.sp
        )
        LazyRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            items(modeOptions, key = { it.id }) { option ->
                val selected = option.id == selectedMode
                Surface(
                    onClick = { onModeClick(option.id) },
                    modifier = Modifier.width(154.dp),
                    shape = RoundedCornerShape(8.dp),
                    color = if (selected) Color(0xFFFFF4E8) else Color(0xFFF8FAFC),
                    border = BorderStroke(1.dp, if (selected) OrangeAccent else SoftBorder)
                ) {
                    Column(
                        modifier = Modifier.padding(10.dp),
                        verticalArrangement = Arrangement.spacedBy(4.dp)
                    ) {
                        Text(option.title, color = if (selected) OrangeAccent else DarkBlue, fontWeight = FontWeight.Bold, fontSize = 13.sp, maxLines = 1)
                        Text(option.description, color = Color(0xFF64748B), fontSize = 11.sp, lineHeight = 14.sp, maxLines = 3, overflow = TextOverflow.Ellipsis)
                    }
                }
            }
        }
    }
}

@Composable
private fun SupportMessageBubble(
    message: SupportChatMessage,
    onSuggestionClick: (String) -> Unit,
    onEscalate: () -> Unit,
    onAddToCart: (AssistantProduct) -> Unit,
    onProductDetails: (AssistantProduct) -> Unit,
    onFavorite: (AssistantProduct) -> Unit,
    onCompare: (AssistantProduct) -> Unit
) {
    val isUser = message.role == SupportMessageRole.User
    val isSystem = message.role == SupportMessageRole.System
    val alignment = if (isUser) Alignment.CenterEnd else Alignment.CenterStart
    val bubbleColor = when {
        isUser -> OrangeAccent
        isSystem -> Color(0xFFFFF7ED)
        else -> Color.White
    }
    val textColor = when {
        isUser -> Color.White
        isSystem -> Color(0xFF8A4B10)
        else -> DarkBlue
    }

    Box(modifier = Modifier.fillMaxWidth(), contentAlignment = alignment) {
        Surface(
            modifier = Modifier.fillMaxWidth(if (isUser) 0.82f else 0.92f),
            shape = RoundedCornerShape(
                topStart = 18.dp,
                topEnd = 18.dp,
                bottomStart = if (isUser) 18.dp else 5.dp,
                bottomEnd = if (isUser) 5.dp else 18.dp
            ),
            color = bubbleColor,
            shadowElevation = if (isUser) 0.dp else 1.dp,
            tonalElevation = 0.dp,
            border = if (isUser) null else BorderStroke(1.dp, if (isSystem) Color(0xFFF7D3A8) else SoftBorder)
        ) {
            Column(modifier = Modifier.padding(13.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                if (isSystem) {
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        Icon(
                            imageVector = Icons.Default.CheckCircle,
                            contentDescription = null,
                            tint = SuccessGreen,
                            modifier = Modifier.size(18.dp)
                        )
                        Text("İşlem bilgisi", color = Color(0xFF9A5A12), fontWeight = FontWeight.Bold, fontSize = 12.sp)
                    }
                }

                Text(
                    text = displayTurkishText(message.message),
                    color = textColor,
                    style = MaterialTheme.typography.bodyMedium,
                    lineHeight = 19.sp
                )

                ProductSuggestions(
                    products = message.products,
                    onAddToCart = onAddToCart,
                    onProductDetails = onProductDetails,
                    onFavorite = onFavorite,
                    onCompare = onCompare
                )

                ComparisonBlock(rows = message.comparisonRows)

                if (message.allowEscalation && !message.requiresConfirmation) {
                    AssistChip(
                        onClick = onEscalate,
                        label = { Text("Canlı desteğe bağlan") },
                        leadingIcon = {
                            Icon(Icons.Default.SupportAgent, contentDescription = null, modifier = Modifier.size(18.dp))
                        },
                        colors = AssistChipDefaults.assistChipColors(
                            containerColor = Color(0xFFFFF4E8),
                            labelColor = OrangeAccent,
                            leadingIconContentColor = OrangeAccent
                        ),
                        border = BorderStroke(1.dp, Color(0xFFF7D3A8))
                    )
                }

                if (message.suggestions.isNotEmpty()) {
                    LazyRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        items(message.suggestions) { suggestion ->
                            AssistChip(
                                onClick = { onSuggestionClick(displayTurkishText(suggestion)) },
                                label = { Text(displayTurkishText(suggestion), maxLines = 1, overflow = TextOverflow.Ellipsis) },
                                leadingIcon = if (suggestion.equals("Tekrar dene", ignoreCase = true)) {
                                    { Icon(Icons.Default.Refresh, contentDescription = null, modifier = Modifier.size(17.dp)) }
                                } else {
                                    null
                                },
                                colors = AssistChipDefaults.assistChipColors(
                                    containerColor = Color(0xFFEEF4FB),
                                    labelColor = PrimaryBlue,
                                    leadingIconContentColor = PrimaryBlue
                                ),
                                border = BorderStroke(1.dp, Color(0xFFD7E3F0))
                            )
                        }
                    }
                }

                Text(
                    text = formatTime(message.createdAt),
                    color = textColor.copy(alpha = 0.62f),
                    fontSize = 11.sp,
                    modifier = Modifier.align(Alignment.End)
                )
            }
        }
    }
}

@Composable
private fun ProductSuggestions(
    products: List<AssistantProduct>,
    onAddToCart: (AssistantProduct) -> Unit,
    onProductDetails: (AssistantProduct) -> Unit,
    onFavorite: (AssistantProduct) -> Unit,
    onCompare: (AssistantProduct) -> Unit
) {
    if (products.isEmpty()) return

    LazyRow(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
        items(products.take(6), key = { it.id ?: it.name.orEmpty() }) { product ->
            ProductAnswerCard(
                product = product,
                onAddToCart = { onAddToCart(product) },
                onProductDetails = { onProductDetails(product) },
                onFavorite = { onFavorite(product) },
                onCompare = { onCompare(product) }
            )
        }
    }
}

@Composable
private fun ProductAnswerCard(
    product: AssistantProduct,
    onAddToCart: () -> Unit,
    onProductDetails: () -> Unit,
    onFavorite: () -> Unit,
    onCompare: () -> Unit
) {
    Surface(
        modifier = Modifier.width(214.dp),
        shape = RoundedCornerShape(8.dp),
        color = Color(0xFFF8FAFC),
        border = BorderStroke(1.dp, SoftBorder)
    ) {
        Column(modifier = Modifier.padding(10.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            AsyncImage(
                model = product.imageUrl,
                contentDescription = product.name,
                modifier = Modifier
                    .fillMaxWidth()
                    .aspectRatio(1.45f)
                    .clip(RoundedCornerShape(6.dp))
                    .background(Color.White),
                contentScale = ContentScale.Crop,
                error = painterResource(id = R.drawable.app_icon)
            )
            Text(
                text = product.name.orEmpty().ifBlank { "NovaStore ürünü" },
                color = DarkBlue,
                fontWeight = FontWeight.Bold,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
                lineHeight = 17.sp
            )
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                Text(
                    text = formatMoney(product.price),
                    color = OrangeAccent,
                    fontWeight = FontWeight.ExtraBold,
                    fontSize = 14.sp
                )
                product.oldPrice?.takeIf { oldPrice -> oldPrice > (product.price ?: 0.0) }?.let {
                    Text(
                        text = formatMoney(it),
                        color = Color(0xFF94A3B8),
                        fontSize = 11.sp,
                        textDecoration = TextDecoration.LineThrough
                    )
                }
            }
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                Text(
                text = if ((product.stock ?: 0) > 0) "Stokta" else "Stok sınırlı",
                    color = if ((product.stock ?: 0) > 0) SuccessGreen else Color(0xFFB45309),
                    fontSize = 12.sp,
                    fontWeight = FontWeight.SemiBold
                )
                val rating = product.averageRating
                if (rating != null && rating > 0) {
                    Text(
                        text = "${String.format(Locale("tr", "TR"), "%.1f", rating)}/5",
                        color = Color(0xFF64748B),
                        fontSize = 12.sp
                    )
                }
            }
            Row(
                modifier = Modifier.horizontalScroll(rememberScrollState()),
                horizontalArrangement = Arrangement.spacedBy(2.dp)
            ) {
                CompactActionButton(Icons.Default.AddShoppingCart, "Sepete ekle", onAddToCart)
                CompactActionButton(Icons.Default.Info, "Detay", onProductDetails)
                CompactActionButton(Icons.Default.FavoriteBorder, "Favori", onFavorite)
                CompactActionButton(Icons.Default.CompareArrows, "Karşılaştır", onCompare)
            }
        }
    }
}

@Composable
private fun CompactActionButton(
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    label: String,
    onClick: () -> Unit
) {
    TextButton(
        onClick = onClick,
        contentPadding = PaddingValues(horizontal = 7.dp, vertical = 4.dp),
        colors = ButtonDefaults.textButtonColors(contentColor = PrimaryBlue)
    ) {
        Icon(icon, contentDescription = label, modifier = Modifier.size(16.dp))
        Spacer(modifier = Modifier.width(3.dp))
        Text(label, fontSize = 11.sp, maxLines = 1)
    }
}

@Composable
private fun ComparisonBlock(rows: List<AssistantComparisonRow>) {
    if (rows.isEmpty()) return

    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Text("Karşılaştırma", color = DarkBlue, fontWeight = FontWeight.ExtraBold, fontSize = 13.sp)
        LazyRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            items(rows, key = { it.productId ?: it.title.orEmpty() }) { row ->
                Surface(
                    modifier = Modifier.width(184.dp),
                    shape = RoundedCornerShape(8.dp),
                    color = Color(0xFFF8FAFC),
                    border = BorderStroke(1.dp, SoftBorder)
                ) {
                    Column(modifier = Modifier.padding(10.dp), verticalArrangement = Arrangement.spacedBy(5.dp)) {
                        Text(displayTurkishText(row.title.orEmpty()), color = DarkBlue, fontWeight = FontWeight.Bold, maxLines = 2, overflow = TextOverflow.Ellipsis)
                        Text(formatMoney(row.price), color = OrangeAccent, fontWeight = FontWeight.ExtraBold)
                        Text("Stok: ${row.stock ?: 0}", color = Color(0xFF64748B), fontSize = 12.sp)
                        row.rating?.takeIf { it > 0 }?.let {
                            Text("Puan: ${String.format(Locale("tr", "TR"), "%.1f", it)}/5", color = Color(0xFF64748B), fontSize = 12.sp)
                        }
                        Text(displayTurkishText(row.bestFor.orEmpty()), color = PrimaryBlue, fontSize = 12.sp, fontWeight = FontWeight.SemiBold, maxLines = 2)
                    }
                }
            }
        }
    }
}

@Composable
private fun TypingBubble(text: String) {
    Box(modifier = Modifier.fillMaxWidth(), contentAlignment = Alignment.CenterStart) {
        Surface(
            shape = RoundedCornerShape(18.dp),
            color = Color.White,
            border = BorderStroke(1.dp, SoftBorder),
            shadowElevation = 1.dp
        ) {
            Row(
                modifier = Modifier.padding(horizontal = 14.dp, vertical = 11.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(9.dp)
            ) {
                CircularProgressIndicator(modifier = Modifier.size(16.dp), strokeWidth = 2.dp, color = OrangeAccent)
                Text(text, color = Color(0xFF64748B), style = MaterialTheme.typography.bodySmall)
            }
        }
    }
}

@Composable
private fun MessageInputBar(
    draft: String,
    enabled: Boolean,
    onDraftChange: (String) -> Unit,
    onSend: () -> Unit
) {
    Surface(
        modifier = Modifier.fillMaxWidth(),
        color = Color.White,
        shadowElevation = 8.dp
    ) {
        Row(
            modifier = Modifier.padding(horizontal = 12.dp, vertical = 10.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            OutlinedTextField(
                value = draft,
                onValueChange = onDraftChange,
                modifier = Modifier.weight(1f),
                enabled = enabled,
                placeholder = { Text("Mesajını yaz...") },
                minLines = 1,
                maxLines = 4,
                shape = RoundedCornerShape(16.dp),
                keyboardOptions = KeyboardOptions(imeAction = ImeAction.Send),
                keyboardActions = KeyboardActions(onSend = { onSend() }),
                colors = TextFieldDefaults.colors(
                    focusedContainerColor = LightBackground,
                    unfocusedContainerColor = LightBackground,
                    disabledContainerColor = LightBackground,
                    focusedIndicatorColor = OrangeAccent,
                    unfocusedIndicatorColor = SoftBorder,
                    disabledIndicatorColor = SoftBorder
                )
            )
            IconButton(
                onClick = onSend,
                enabled = enabled && draft.isNotBlank(),
                modifier = Modifier
                    .size(48.dp)
                    .clip(CircleShape)
                    .background(if (enabled && draft.isNotBlank()) OrangeAccent else Color(0xFFE2E8F0))
            ) {
                Icon(
                    imageVector = if (enabled) Icons.Default.Send else Icons.Default.ErrorOutline,
                    contentDescription = stringResource(R.string.support_send),
                    tint = Color.White
                )
            }
        }
    }
}

private fun formatTime(value: Long): String {
    return SimpleDateFormat("HH:mm", Locale("tr", "TR")).format(Date(value))
}

private fun formatMoney(value: Double?): String {
    return NumberFormat.getCurrencyInstance(Locale("tr", "TR")).format(value ?: 0.0)
}
