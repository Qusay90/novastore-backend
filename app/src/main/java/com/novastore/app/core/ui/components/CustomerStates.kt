package com.novastore.app.core.ui.components

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.CloudOff
import androidx.compose.material.icons.outlined.ErrorOutline
import androidx.compose.material.icons.outlined.Inbox
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.novastore.app.core.design.CustomerColors
import com.novastore.app.core.design.CustomerSpacing

enum class CustomerStateKind {
    LOADING,
    EMPTY,
    ERROR,
    OFFLINE
}

@Composable
fun CustomerStatePanel(
    kind: CustomerStateKind,
    title: String,
    message: String,
    modifier: Modifier = Modifier,
    actionLabel: String? = null,
    onAction: (() -> Unit)? = null
) {
    CustomerCard(modifier = modifier) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(vertical = CustomerSpacing.Lg),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center
        ) {
            if (kind == CustomerStateKind.LOADING) {
                CircularProgressIndicator(color = CustomerColors.Orange)
            } else {
                Icon(
                    imageVector = when (kind) {
                        CustomerStateKind.EMPTY -> Icons.Outlined.Inbox
                        CustomerStateKind.ERROR -> Icons.Outlined.ErrorOutline
                        CustomerStateKind.OFFLINE -> Icons.Outlined.CloudOff
                        CustomerStateKind.LOADING -> Icons.Outlined.Inbox
                    },
                    contentDescription = null,
                    tint = when (kind) {
                        CustomerStateKind.ERROR -> CustomerColors.Error
                        CustomerStateKind.OFFLINE -> CustomerColors.Warning
                        else -> CustomerColors.Navy
                    },
                    modifier = Modifier.size(40.dp)
                )
            }
            Spacer(Modifier.height(CustomerSpacing.Sm))
            Text(title, style = MaterialTheme.typography.titleMedium)
            Spacer(Modifier.height(CustomerSpacing.Xs))
            Text(
                text = message,
                style = MaterialTheme.typography.bodySmall,
                color = CustomerColors.TextSecondary
            )
            if (actionLabel != null && onAction != null) {
                Spacer(Modifier.height(CustomerSpacing.Md))
                CustomerButton(
                    text = actionLabel,
                    onClick = onAction,
                    style = CustomerButtonStyle.OUTLINED
                )
            }
        }
    }
}
