package com.novastore.app.qa

import com.novastore.app.core.ui.components.CustomerTimelineItem
import com.novastore.app.core.ui.components.CustomerTimelineState

data class QaFixtureSnapshot(
    val customerName: String,
    val maskedEmail: String,
    val maskedPhone: String,
    val cartCount: Int,
    val otp: String,
    val timeline: List<CustomerTimelineItem>
)

fun interface QaFixtureDataSource {
    fun snapshot(): QaFixtureSnapshot
}

object DeterministicQaFixtureDataSource : QaFixtureDataSource {
    override fun snapshot() = QaFixtureSnapshot(
        customerName = "Nova Test Kullanıcısı",
        maskedEmail = "no••@example.test",
        maskedPhone = "+90 5•• ••• •• 42",
        cartCount = 3,
        otp = "258174",
        timeline = listOf(
            CustomerTimelineItem(
                title = "Dağıtım merkezinde",
                detail = "22 Temmuz • 08:40",
                state = CustomerTimelineState.ACTIVE
            ),
            CustomerTimelineItem(
                title = "Transfer sürecinde",
                detail = "21 Temmuz • 18:15",
                state = CustomerTimelineState.COMPLETED
            ),
            CustomerTimelineItem(
                title = "Sipariş hazırlandı",
                detail = "20 Temmuz • 09:10",
                state = CustomerTimelineState.COMPLETED
            )
        )
    )
}
