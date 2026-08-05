package com.novastore.app.core.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.CheckCircle
import androidx.compose.material.icons.outlined.RadioButtonChecked
import androidx.compose.material.icons.outlined.RadioButtonUnchecked
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import com.novastore.app.core.design.CustomerColors
import com.novastore.app.core.design.CustomerElevation
import com.novastore.app.core.design.CustomerRadii
import com.novastore.app.core.design.CustomerSpacing

@Composable
fun CustomerCard(
    modifier: Modifier = Modifier,
    content: @Composable ColumnScope.() -> Unit
) {
    Surface(
        modifier = modifier.fillMaxWidth(),
        shape = RoundedCornerShape(CustomerRadii.Card),
        color = CustomerColors.Surface,
        shadowElevation = CustomerElevation.Resting
    ) {
        Column(
            modifier = Modifier.padding(CustomerSpacing.CardPadding),
            content = content
        )
    }
}

@Composable
fun CustomerSectionTitle(title: String, modifier: Modifier = Modifier) {
    Text(
        text = title,
        modifier = modifier,
        style = MaterialTheme.typography.titleLarge,
        color = CustomerColors.TextPrimary
    )
}

enum class CustomerTimelineState {
    COMPLETED,
    ACTIVE,
    PENDING
}

data class CustomerTimelineItem(
    val title: String,
    val detail: String,
    val state: CustomerTimelineState
)

@Composable
fun CustomerTimeline(
    items: List<CustomerTimelineItem>,
    modifier: Modifier = Modifier
) {
    Column(modifier = modifier.fillMaxWidth()) {
        items.forEachIndexed { index, item ->
            Row(modifier = Modifier.fillMaxWidth()) {
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    Icon(
                        imageVector = when (item.state) {
                            CustomerTimelineState.COMPLETED -> Icons.Outlined.CheckCircle
                            CustomerTimelineState.ACTIVE -> Icons.Outlined.RadioButtonChecked
                            CustomerTimelineState.PENDING -> Icons.Outlined.RadioButtonUnchecked
                        },
                        contentDescription = null,
                        tint = when (item.state) {
                            CustomerTimelineState.ACTIVE -> CustomerColors.Orange
                            CustomerTimelineState.COMPLETED -> CustomerColors.Navy
                            CustomerTimelineState.PENDING -> CustomerColors.TextSecondary
                        },
                        modifier = Modifier.size(24.dp)
                    )
                    if (index != items.lastIndex) {
                        Box(
                            modifier = Modifier
                                .width(1.dp)
                                .height(38.dp)
                                .background(CustomerColors.Outline)
                        )
                    }
                }
                Spacer(Modifier.width(CustomerSpacing.Sm))
                Column(modifier = Modifier.padding(bottom = CustomerSpacing.Md)) {
                    Text(item.title, style = MaterialTheme.typography.titleSmall)
                    Spacer(Modifier.height(CustomerSpacing.Xxs))
                    Text(item.detail, style = MaterialTheme.typography.bodySmall)
                }
            }
        }
    }
}

@Composable
fun CustomerModalCard(
    title: String,
    message: String,
    modifier: Modifier = Modifier,
    content: @Composable ColumnScope.() -> Unit = {}
) {
    Surface(
        modifier = modifier.fillMaxWidth(),
        shape = RoundedCornerShape(
            topStart = CustomerRadii.BottomSheet,
            topEnd = CustomerRadii.BottomSheet,
            bottomStart = CustomerRadii.Card,
            bottomEnd = CustomerRadii.Card
        ),
        color = CustomerColors.Surface,
        shadowElevation = CustomerElevation.Floating
    ) {
        Column(
            modifier = Modifier.padding(CustomerSpacing.Xl),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            Box(
                modifier = Modifier
                    .width(48.dp)
                    .height(5.dp)
                    .background(CustomerColors.Disabled, CircleShape)
            )
            Spacer(Modifier.height(CustomerSpacing.Xl))
            Text(title, style = MaterialTheme.typography.titleLarge)
            Spacer(Modifier.height(CustomerSpacing.Xs))
            Text(
                text = message,
                style = MaterialTheme.typography.bodyMedium,
                color = CustomerColors.TextSecondary
            )
            Spacer(Modifier.height(CustomerSpacing.Lg))
            content()
        }
    }
}

@Composable
fun CustomerModalDialog(
    title: String,
    message: String,
    onDismissRequest: () -> Unit,
    modifier: Modifier = Modifier,
    content: @Composable ColumnScope.() -> Unit = {}
) {
    Dialog(
        onDismissRequest = onDismissRequest,
        properties = DialogProperties(
            dismissOnBackPress = true,
            dismissOnClickOutside = true,
            usePlatformDefaultWidth = false
        )
    ) {
        CustomerModalCard(
            title = title,
            message = message,
            modifier = modifier.padding(horizontal = CustomerSpacing.Md),
            content = content
        )
    }
}

@Composable
fun CustomerKeyValueRow(label: String, value: String, modifier: Modifier = Modifier) {
    Row(
        modifier = modifier
            .fillMaxWidth()
            .padding(vertical = CustomerSpacing.Xs),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically
    ) {
        Text(label, style = MaterialTheme.typography.bodyMedium, color = CustomerColors.TextSecondary)
        Text(value, style = MaterialTheme.typography.titleSmall, color = CustomerColors.TextPrimary)
    }
}
