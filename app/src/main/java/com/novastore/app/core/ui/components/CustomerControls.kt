package com.novastore.app.core.ui.components

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.sizeIn
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.FilterChip
import androidx.compose.material3.LocalContentColor
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Surface
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.unit.dp
import com.novastore.app.core.design.CustomerColors
import com.novastore.app.core.design.CustomerDimensions
import com.novastore.app.core.design.CustomerRadii
import com.novastore.app.core.design.CustomerSpacing

enum class CustomerButtonStyle {
    PRIMARY,
    NAVY,
    OUTLINED,
    DANGER
}

@Composable
fun CustomerButton(
    text: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    style: CustomerButtonStyle = CustomerButtonStyle.PRIMARY,
    enabled: Boolean = true,
    leadingIcon: (@Composable RowScope.() -> Unit)? = null
) {
    val shape = RoundedCornerShape(CustomerRadii.Button)
    val content: @Composable RowScope.() -> Unit = {
        if (leadingIcon != null) {
            leadingIcon()
            Spacer(Modifier.width(CustomerSpacing.Xs))
        }
        Text(
            text = text,
            style = MaterialTheme.typography.labelLarge,
            color = LocalContentColor.current
        )
    }
    if (style == CustomerButtonStyle.OUTLINED) {
        OutlinedButton(
            onClick = onClick,
            modifier = modifier
                .height(CustomerDimensions.ButtonHeight)
                .sizeIn(minWidth = CustomerDimensions.MinimumTouchTarget),
            enabled = enabled,
            shape = shape,
            border = BorderStroke(1.dp, CustomerColors.Navy),
            colors = ButtonDefaults.outlinedButtonColors(contentColor = CustomerColors.Navy),
            content = content
        )
    } else {
        val container = when (style) {
            CustomerButtonStyle.PRIMARY -> CustomerColors.Orange
            CustomerButtonStyle.NAVY -> CustomerColors.Navy
            CustomerButtonStyle.DANGER -> CustomerColors.Error
            CustomerButtonStyle.OUTLINED -> Color.Transparent
        }
        Button(
            onClick = onClick,
            modifier = modifier
                .height(CustomerDimensions.ButtonHeight)
                .sizeIn(minWidth = CustomerDimensions.MinimumTouchTarget),
            enabled = enabled,
            shape = shape,
            colors = ButtonDefaults.buttonColors(
                containerColor = container,
                contentColor = Color.White,
                disabledContainerColor = CustomerColors.Disabled,
                disabledContentColor = CustomerColors.TextSecondary
            ),
            content = content
        )
    }
}

@Composable
fun CustomerTextField(
    value: String,
    onValueChange: (String) -> Unit,
    label: String,
    modifier: Modifier = Modifier,
    supportingText: String? = null,
    isError: Boolean = false,
    enabled: Boolean = true,
    singleLine: Boolean = true,
    visualTransformation: VisualTransformation = VisualTransformation.None,
    keyboardOptions: KeyboardOptions = KeyboardOptions.Default,
    keyboardActions: KeyboardActions = KeyboardActions.Default,
    trailingIcon: (@Composable () -> Unit)? = null
) {
    OutlinedTextField(
        value = value,
        onValueChange = onValueChange,
        modifier = modifier
            .fillMaxWidth()
            .sizeIn(minHeight = CustomerDimensions.FieldHeight),
        label = { Text(label) },
        supportingText = supportingText?.let { text -> { Text(text) } },
        isError = isError,
        enabled = enabled,
        singleLine = singleLine,
        shape = RoundedCornerShape(CustomerRadii.Field),
        visualTransformation = visualTransformation,
        keyboardOptions = keyboardOptions,
        keyboardActions = keyboardActions,
        trailingIcon = trailingIcon,
        colors = OutlinedTextFieldDefaults.colors(
            focusedBorderColor = CustomerColors.Navy,
            unfocusedBorderColor = CustomerColors.Outline,
            cursorColor = CustomerColors.Navy,
            focusedLabelColor = CustomerColors.Navy,
            errorBorderColor = CustomerColors.Error,
            errorLabelColor = CustomerColors.Error
        )
    )
}

@Composable
fun CustomerSwitchRow(
    title: String,
    checked: Boolean,
    onCheckedChange: (Boolean) -> Unit,
    modifier: Modifier = Modifier,
    description: String? = null,
    enabled: Boolean = true
) {
    Surface(
        modifier = modifier
            .fillMaxWidth()
            .clickable(enabled = enabled) { onCheckedChange(!checked) },
        shape = RoundedCornerShape(CustomerRadii.Field),
        color = CustomerColors.Surface
    ) {
        Row(
            modifier = Modifier.padding(CustomerSpacing.Md),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Column(modifier = Modifier.weight(1f)) {
                Text(title, style = MaterialTheme.typography.titleSmall)
                if (description != null) {
                    Spacer(Modifier.height(CustomerSpacing.Xxs))
                    Text(description, style = MaterialTheme.typography.bodySmall)
                }
            }
            Switch(
                checked = checked,
                onCheckedChange = onCheckedChange,
                enabled = enabled,
                colors = SwitchDefaults.colors(
                    checkedThumbColor = Color.White,
                    checkedTrackColor = CustomerColors.Orange,
                    uncheckedThumbColor = Color.White,
                    uncheckedTrackColor = CustomerColors.Outline,
                    uncheckedBorderColor = CustomerColors.Outline,
                    disabledUncheckedThumbColor = CustomerColors.Surface,
                    disabledUncheckedTrackColor = CustomerColors.Disabled,
                    disabledUncheckedBorderColor = CustomerColors.Disabled
                )
            )
        }
    }
}

@Composable
fun CustomerChoiceChip(
    label: String,
    selected: Boolean,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    leadingIcon: ImageVector? = null
) {
    FilterChip(
        selected = selected,
        onClick = onClick,
        modifier = modifier,
        label = { Text(label) },
        leadingIcon = leadingIcon?.let { icon ->
            { androidx.compose.material3.Icon(icon, contentDescription = null, modifier = Modifier.size(18.dp)) }
        }
    )
}

@Composable
fun CustomerTabs(
    tabs: List<String>,
    selectedIndex: Int,
    onSelected: (Int) -> Unit,
    modifier: Modifier = Modifier
) {
    require(tabs.isNotEmpty()) { "Customer tabs cannot be empty" }
    require(selectedIndex in tabs.indices) { "Selected tab index is out of range" }
    Surface(
        modifier = modifier.fillMaxWidth(),
        shape = RoundedCornerShape(CustomerRadii.Pill),
        color = CustomerColors.SurfaceMuted
    ) {
        Row(modifier = Modifier.padding(CustomerSpacing.Xxs)) {
            tabs.forEachIndexed { index, label ->
                val isSelected = index == selectedIndex
                Box(
                    modifier = Modifier
                        .weight(1f)
                        .sizeIn(minHeight = CustomerDimensions.MinimumTouchTarget)
                        .background(
                            color = if (isSelected) CustomerColors.Navy else Color.Transparent,
                            shape = RoundedCornerShape(CustomerRadii.Pill)
                        )
                        .semantics {
                            selected = isSelected
                            role = Role.Tab
                        }
                        .clickable { onSelected(index) },
                    contentAlignment = Alignment.Center
                ) {
                    Text(
                        text = label,
                        color = if (isSelected) Color.White else CustomerColors.Navy,
                        style = MaterialTheme.typography.labelMedium
                    )
                }
            }
        }
    }
}

@Composable
fun CustomerOtpInput(
    value: String,
    onValueChange: (String) -> Unit,
    modifier: Modifier = Modifier,
    length: Int = 6,
    enabled: Boolean = true
) {
    require(length in 4..8) { "OTP length must be between 4 and 8" }
    val interactionSource = remember { MutableInteractionSource() }
    BasicTextField(
        value = value,
        onValueChange = { raw -> onValueChange(raw.filter(Char::isDigit).take(length)) },
        modifier = modifier
            .fillMaxWidth()
            .semantics { contentDescription = "$length haneli doğrulama kodu" },
        enabled = enabled,
        singleLine = true,
        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.NumberPassword),
        cursorBrush = SolidColor(Color.Transparent),
        interactionSource = interactionSource,
        decorationBox = { innerTextField ->
            Box {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(CustomerSpacing.Xs, Alignment.CenterHorizontally)
                ) {
                    repeat(length) { index ->
                        val digit = value.getOrNull(index)?.toString().orEmpty()
                        Box(
                            modifier = Modifier
                                .size(CustomerDimensions.OtpCellWidth, CustomerDimensions.OtpCellHeight)
                                .border(
                                    width = 1.dp,
                                    color = if (index == value.length && enabled) {
                                        CustomerColors.Navy
                                    } else {
                                        CustomerColors.Outline
                                    },
                                    shape = RoundedCornerShape(CustomerRadii.Field)
                                )
                                .background(CustomerColors.Surface, RoundedCornerShape(CustomerRadii.Field)),
                            contentAlignment = Alignment.Center
                        ) {
                            Text(digit, style = MaterialTheme.typography.titleLarge)
                        }
                    }
                }
                Box(modifier = Modifier.matchParentSize().alpha(0f)) {
                    innerTextField()
                }
            }
        }
    )
}
