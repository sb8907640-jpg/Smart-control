package com.smartcontrol.presentation.billing

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.smartcontrol.domain.billing.Plan
import com.smartcontrol.domain.billing.Payment
import com.google.firebase.auth.FirebaseAuth

@Composable
fun BillingScreen(
    onBack: () -> Unit,
    onRazorpayCheckout: (Payment) -> Unit = {},
    viewModel: BillingViewModel = androidx.hilt.navigation.compose.hiltViewModel()
) {
    val plans by viewModel.plans.collectAsState()
    val subscription by viewModel.subscription.collectAsState()
    val message by viewModel.message.collectAsState()
    val busy by viewModel.busy.collectAsState()
    val pendingCheckout by viewModel.pendingCheckout.collectAsState()
    var method by remember { mutableStateOf("UPI") }
    var coupon by remember { mutableStateOf("") }

    LaunchedEffect(Unit) {
        viewModel.load(FirebaseAuth.getInstance().currentUser?.uid.orEmpty())
    }

    LaunchedEffect(pendingCheckout?.id) {
        pendingCheckout?.let {
            onRazorpayCheckout(it)
            viewModel.clearPendingCheckout()
        }
    }

    Column(Modifier.fillMaxSize().padding(16.dp)) {
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
            Text("Plans & Billing", style = MaterialTheme.typography.headlineSmall)
            OutlinedButton(onClick = onBack) { Text("Back") }
        }
        subscription?.let {
            Card(Modifier.fillMaxWidth().padding(vertical = 8.dp)) {
                Column(Modifier.padding(12.dp)) {
                    Text("Current subscription: " + it.status)
                    Text("Plan: " + it.planId)
                    Text("Expires: " + it.expiresAtEpochMs)
                }
            }
        }
        OutlinedTextField(
            value = method,
            onValueChange = { method = it.uppercase() },
            label = { Text("Payment method") },
            singleLine = true,
            modifier = Modifier.fillMaxWidth()
        )
        Text("Use UPI, CARD, NET_BANKING, WALLET, EMI or BANK_TRANSFER. The active gateway is controlled by Owner settings.")
        OutlinedTextField(
            value = coupon,
            onValueChange = { coupon = it.uppercase() },
            label = { Text("Coupon code (optional)") },
            singleLine = true,
            modifier = Modifier.fillMaxWidth()
        )
        if (busy) LinearProgressIndicator(Modifier.fillMaxWidth())
        message?.let { Text(it, Modifier.padding(vertical = 8.dp)) }

        LazyColumn(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            items(plans) { plan -> PlanCard(plan) { viewModel.buy(plan, method, coupon) } }
        }
    }
}

@Composable
private fun PlanCard(plan: Plan, onBuy: () -> Unit) {
    Card(Modifier.fillMaxWidth()) {
        Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(5.dp)) {
            Text(plan.name, style = MaterialTheme.typography.titleLarge)
            if (plan.tagline.isNotBlank()) Text(plan.tagline)
            Text(plan.currency + " " + (plan.priceMinor / 100.0) + " • " + plan.durationValue + " " + plan.durationUnit.lowercase())
            Text(plan.featureIds.size.toString() + "/19 features • " + plan.deviceLimit + " devices • " + plan.userLimit + " users")
            if (plan.badge.isNotBlank()) Text(plan.badge)
            Button(onClick = onBuy) { Text("Create Payment") }
        }
    }
}
