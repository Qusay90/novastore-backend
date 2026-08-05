package com.novastore.app.qa

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Settings
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.novastore.app.BuildConfig
import com.novastore.app.core.design.CustomerColors
import com.novastore.app.core.design.CustomerSpacing
import com.novastore.app.core.navigation.CustomerVisualManifest
import com.novastore.app.core.navigation.CustomerVisualReference
import com.novastore.app.core.ui.components.CustomerBubbleBottomBar
import com.novastore.app.core.ui.components.CustomerButton
import com.novastore.app.core.ui.components.CustomerButtonStyle
import com.novastore.app.core.ui.components.CustomerCard
import com.novastore.app.core.ui.components.CustomerChoiceChip
import com.novastore.app.core.ui.components.CustomerKeyValueRow
import com.novastore.app.core.ui.components.CustomerModalCard
import com.novastore.app.core.ui.components.CustomerModalDialog
import com.novastore.app.core.ui.components.CustomerOtpInput
import com.novastore.app.core.ui.components.CustomerSectionTitle
import com.novastore.app.core.ui.components.CustomerStateKind
import com.novastore.app.core.ui.components.CustomerStatePanel
import com.novastore.app.core.ui.components.CustomerSwitchRow
import com.novastore.app.core.ui.components.CustomerTabs
import com.novastore.app.core.ui.components.CustomerTextField
import com.novastore.app.core.ui.components.CustomerTimeline
import com.novastore.app.core.ui.components.CustomerTopBar

@Composable
fun QaScenarioApp(
    fixture: QaFixtureSnapshot,
    modifier: Modifier = Modifier
) {
    var page by remember { mutableIntStateOf(0) }
    Column(
        modifier = modifier
            .fillMaxSize()
            .background(CustomerColors.Page)
            .statusBarsPadding()
            .navigationBarsPadding()
            .testTag("qa_scenario_root")
    ) {
        QaBuildLabel()
        CustomerTabs(
            tabs = listOf("Bileşenler", "80 Senaryo"),
            selectedIndex = page,
            onSelected = { page = it },
            modifier = Modifier.padding(horizontal = CustomerSpacing.Md)
        )
        Spacer(Modifier.height(CustomerSpacing.Xs))
        if (page == 0) {
            CustomerComponentCatalog(fixture = fixture, modifier = Modifier.weight(1f))
        } else {
            QaScenarioSelector(modifier = Modifier.weight(1f))
        }
    }
}

@Composable
private fun QaBuildLabel() {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .background(CustomerColors.NavyDeep)
            .padding(horizontal = CustomerSpacing.Md, vertical = CustomerSpacing.Xs)
            .testTag("qa_build_label")
    ) {
        Text(
            text = "GÖRSEL QA • ${BuildConfig.QA_BUILD_LABEL}",
            color = CustomerColors.Surface,
            style = MaterialTheme.typography.labelMedium,
            fontWeight = FontWeight.Bold,
            maxLines = 2,
            overflow = TextOverflow.Ellipsis
        )
        Text(
            text = "APK: ${BuildConfig.APPLICATION_ID} ${BuildConfig.VERSION_NAME} (${BuildConfig.VERSION_CODE}) / ${BuildConfig.BUILD_TYPE}",
            color = CustomerColors.Surface.copy(alpha = 0.78f),
            style = MaterialTheme.typography.labelSmall
        )
    }
}

@Composable
private fun CustomerComponentCatalog(
    fixture: QaFixtureSnapshot,
    modifier: Modifier = Modifier
) {
    var selectedDestination by remember { mutableStateOf("home") }
    var textValue by remember { mutableStateOf(fixture.customerName) }
    var switchValue by remember { mutableStateOf(false) }
    var chipValue by remember { mutableStateOf("Tümü") }
    var tabValue by remember { mutableIntStateOf(0) }
    var otp by remember { mutableStateOf(fixture.otp) }
    var showModal by remember { mutableStateOf(false) }

    val destinations = remember(fixture.cartCount) { qaBottomDestinations(fixture.cartCount) }

    LazyColumn(
        modifier = modifier
            .fillMaxWidth()
            .testTag("component_catalog"),
        contentPadding = PaddingValues(CustomerSpacing.Md),
        verticalArrangement = Arrangement.spacedBy(CustomerSpacing.SectionGap)
    ) {
        item {
            CustomerTopBar(
                title = "Bileşen Kataloğu",
                onBack = {},
                actions = {
                    IconButton(onClick = {}) {
                        Icon(Icons.Outlined.Settings, contentDescription = "Ayarlar")
                    }
                },
                modifier = Modifier.testTag("component_top_bar")
            )
        }
        item {
            Column(verticalArrangement = Arrangement.spacedBy(CustomerSpacing.Xs)) {
                CustomerSectionTitle("Alt navigasyon")
                CustomerBubbleBottomBar(
                    destinations = destinations,
                    selectedId = selectedDestination,
                    onSelect = { selectedDestination = it.id },
                    reduceMotion = switchValue,
                    modifier = Modifier.testTag("component_bottom_bar")
                )
            }
        }
        item {
            Column(verticalArrangement = Arrangement.spacedBy(CustomerSpacing.Xs)) {
                CustomerSectionTitle("Kart ve düğmeler")
                CustomerCard(modifier = Modifier.testTag("component_card")) {
                    Text("Siparişlerin", style = MaterialTheme.typography.titleMedium)
                    Spacer(Modifier.height(CustomerSpacing.Xs))
                    Text(
                        "Ortak kart yüzeyi, gölge ve 20 dp köşe sözleşmesi.",
                        style = MaterialTheme.typography.bodyMedium
                    )
                    Spacer(Modifier.height(CustomerSpacing.Md))
                    CustomerButton("Birincil işlem", onClick = {}, modifier = Modifier.fillMaxWidth())
                    Spacer(Modifier.height(CustomerSpacing.Xs))
                    CustomerButton(
                        "İkincil işlem",
                        onClick = {},
                        modifier = Modifier.fillMaxWidth(),
                        style = CustomerButtonStyle.OUTLINED
                    )
                }
            }
        }
        item {
            Column(verticalArrangement = Arrangement.spacedBy(CustomerSpacing.Xs)) {
                CustomerSectionTitle("Form, switch, chip ve sekme")
                CustomerTextField(
                    value = textValue,
                    onValueChange = { textValue = it },
                    label = "Ad Soyad",
                    supportingText = fixture.maskedEmail,
                    modifier = Modifier.testTag("component_text_field")
                )
                CustomerSwitchRow(
                    title = "Hareketi azalt",
                    description = "Balon geçişlerini daha kısa ve sade göster.",
                    checked = switchValue,
                    onCheckedChange = { switchValue = it },
                    modifier = Modifier.testTag("component_switch")
                )
                Row(horizontalArrangement = Arrangement.spacedBy(CustomerSpacing.Xs)) {
                    listOf("Tümü", "Aktif", "Tamamlandı").forEach { label ->
                        CustomerChoiceChip(
                            label = label,
                            selected = chipValue == label,
                            onClick = { chipValue = label }
                        )
                    }
                }
                CustomerTabs(
                    tabs = listOf("Bekleyen", "Yayında", "İnceleniyor"),
                    selectedIndex = tabValue,
                    onSelected = { tabValue = it },
                    modifier = Modifier.testTag("component_tabs")
                )
            }
        }
        item {
            Column(verticalArrangement = Arrangement.spacedBy(CustomerSpacing.Xs)) {
                CustomerSectionTitle("OTP")
                CustomerOtpInput(
                    value = otp,
                    onValueChange = { otp = it },
                    modifier = Modifier.testTag("component_otp")
                )
                Text("Kod kimseyle paylaşılmamalı.", style = MaterialTheme.typography.bodySmall)
            }
        }
        item {
            Column(verticalArrangement = Arrangement.spacedBy(CustomerSpacing.Xs)) {
                CustomerSectionTitle("Timeline")
                CustomerCard {
                    CustomerTimeline(fixture.timeline, modifier = Modifier.testTag("component_timeline"))
                }
            }
        }
        item {
            Column(verticalArrangement = Arrangement.spacedBy(CustomerSpacing.Xs)) {
                CustomerSectionTitle("Modal")
                CustomerModalCard(
                    title = "İşlemi onaylıyor musun?",
                    message = "Bu debug örneği gerçek veriye veya servise bağlanmaz.",
                    modifier = Modifier.testTag("component_modal")
                ) {
                    CustomerButton("Onayla", onClick = {}, modifier = Modifier.fillMaxWidth())
                    Spacer(Modifier.height(CustomerSpacing.Xs))
                    CustomerButton(
                        "Vazgeç",
                        onClick = {},
                        modifier = Modifier.fillMaxWidth(),
                        style = CustomerButtonStyle.OUTLINED
                    )
                }
                Spacer(Modifier.height(CustomerSpacing.Xs))
                CustomerButton(
                    "Etkileşimli modalı aç",
                    onClick = { showModal = true },
                    modifier = Modifier
                        .fillMaxWidth()
                        .testTag("component_modal_trigger"),
                    style = CustomerButtonStyle.NAVY
                )
            }
        }
        item {
            Column(verticalArrangement = Arrangement.spacedBy(CustomerSpacing.Xs)) {
                CustomerSectionTitle("Loading / empty / error")
                CustomerStatePanel(
                    kind = CustomerStateKind.LOADING,
                    title = "Yükleniyor",
                    message = "İçerik hazırlanıyor.",
                    modifier = Modifier.testTag("component_loading")
                )
                CustomerStatePanel(
                    kind = CustomerStateKind.EMPTY,
                    title = "Henüz içerik yok",
                    message = "Yeni kayıtlar burada görünecek.",
                    modifier = Modifier.testTag("component_empty")
                )
                CustomerStatePanel(
                    kind = CustomerStateKind.ERROR,
                    title = "Bir sorun oluştu",
                    message = "Bağlantını kontrol edip tekrar dene.",
                    actionLabel = "Tekrar dene",
                    onAction = {},
                    modifier = Modifier.testTag("component_error")
                )
                CustomerStatePanel(
                    kind = CustomerStateKind.OFFLINE,
                    title = "Bağlantı yok",
                    message = "İnternet bağlantın geri geldiğinde içerik yenilenecek.",
                    actionLabel = "Yeniden dene",
                    onAction = {},
                    modifier = Modifier.testTag("component_offline")
                )
            }
        }
    }

    if (showModal) {
        CustomerModalDialog(
            title = "İşlemi onaylıyor musun?",
            message = "Bu debug fixture yalnız yerel ve sentetik veriyi kullanır.",
            onDismissRequest = { showModal = false },
            modifier = Modifier.testTag("component_modal_dialog")
        ) {
            CustomerButton(
                "Onayla",
                onClick = { showModal = false },
                modifier = Modifier.fillMaxWidth()
            )
            Spacer(Modifier.height(CustomerSpacing.Xs))
            CustomerButton(
                "Vazgeç",
                onClick = { showModal = false },
                modifier = Modifier
                    .fillMaxWidth()
                    .testTag("component_modal_dialog_dismiss"),
                style = CustomerButtonStyle.OUTLINED
            )
        }
    }
}

@Composable
private fun QaScenarioSelector(modifier: Modifier = Modifier) {
    var selectedFile by remember { mutableStateOf<String?>(null) }
    val references = remember { CustomerVisualManifest.references.sortedWith(compareBy({ it.tour }, { it.referenceFile })) }

    LazyColumn(
        modifier = modifier
            .fillMaxWidth()
            .testTag("scenario_selector"),
        contentPadding = PaddingValues(CustomerSpacing.Md),
        verticalArrangement = Arrangement.spacedBy(CustomerSpacing.Sm)
    ) {
        item {
            CustomerCard {
                Text("Tur 1 rota-görsel manifesti", style = MaterialTheme.typography.titleMedium)
                Spacer(Modifier.height(CustomerSpacing.Xs))
                CustomerKeyValueRow("Referans dosyası", CustomerVisualManifest.references.size.toString())
                CustomerKeyValueRow("Benzersiz screenId", CustomerVisualManifest.referencesByScreenId.size.toString())
                CustomerKeyValueRow("Doğrulama", if (CustomerVisualManifest.validationErrors.isEmpty()) "PASS" else "FAIL")
                Text(
                    "Bu seçici sözleşme ve fixture kanıtıdır; gerçek ekranlar Tur 2 ve sonrasında bağlanır.",
                    style = MaterialTheme.typography.bodySmall
                )
            }
        }
        items(references, key = CustomerVisualReference::referenceFile) { reference ->
            val selected = reference.referenceFile == selectedFile
            CustomerCard(
                modifier = Modifier
                    .clickable {
                        selectedFile = if (selected) null else reference.referenceFile
                    }
                    .testTag("scenario_${reference.screenId}")
            ) {
                Text("Tur ${reference.tour} • ${reference.screenId}", style = MaterialTheme.typography.titleSmall)
                Text(reference.referenceFile, style = MaterialTheme.typography.bodyMedium)
                if (selected) {
                    Spacer(Modifier.height(CustomerSpacing.Xs))
                    CustomerKeyValueRow("Rota", reference.routeId.name)
                    CustomerKeyValueRow("Auth", reference.authRequirement.name)
                    CustomerKeyValueRow("Chrome", reference.chrome.name)
                    CustomerKeyValueRow("State", reference.sampleState.name)
                    CustomerKeyValueRow("Varyant", reference.variant)
                    CustomerKeyValueRow("Ölçü", "${reference.referenceWidth}×${reference.referenceHeight}")
                    Text(
                        reference.referenceSha256,
                        style = MaterialTheme.typography.labelSmall,
                        color = CustomerColors.TextSecondary
                    )
                }
            }
        }
    }
}
