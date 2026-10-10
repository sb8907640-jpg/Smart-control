package com.smartcontrol.presentation.billing

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.smartcontrol.domain.billing.BillingRepository
import com.smartcontrol.domain.billing.EmiSchedule
import com.smartcontrol.domain.billing.Payment
import com.smartcontrol.domain.billing.Plan
import com.smartcontrol.domain.billing.Subscription
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

@HiltViewModel
class BillingViewModel @Inject constructor(
    private val repository: BillingRepository
) : ViewModel() {
    private val _plans = MutableStateFlow<List<Plan>>(emptyList())
    val plans: StateFlow<List<Plan>> = _plans.asStateFlow()
    private val _subscription = MutableStateFlow<Subscription?>(null)
    val subscription: StateFlow<Subscription?> = _subscription.asStateFlow()
    private val _message = MutableStateFlow<String?>(null)
    val message: StateFlow<String?> = _message.asStateFlow()
    private val _busy = MutableStateFlow(false)
    val busy: StateFlow<Boolean> = _busy.asStateFlow()
    private val _pendingCheckout = MutableStateFlow<Payment?>(null)
    val pendingCheckout: StateFlow<Payment?> = _pendingCheckout.asStateFlow()

    fun clearPendingCheckout() { _pendingCheckout.value = null }

    fun load(userId: String) {
        viewModelScope.launch {
            _busy.value = true
            runCatching {
                _plans.value = repository.getPlans()
                _subscription.value = repository.getSubscription(userId)
            }.onFailure { _message.value = it.message ?: "Unable to load billing." }
            _busy.value = false
        }
    }

    fun buy(plan: Plan, method: String, coupon: String) {
        viewModelScope.launch {
            _busy.value = true
            repository.createPlanPayment(plan.id, "RAZORPAY", method, coupon)
                .onSuccess { payment ->
                    if (payment.gateway.equals("RAZORPAY", ignoreCase = true) &&
                        !payment.gatewayOrderId.isNullOrBlank() &&
                        !payment.gatewayKeyId.isNullOrBlank()
                    ) {
                        _pendingCheckout.value = payment
                        _message.value = "Opening secure Razorpay checkout…"
                    } else if (payment.status == Payment.Status.SUCCESS) {
                        _message.value = "Payment completed and subscription is active."
                    } else {
                        _message.value = "Payment order created: " + payment.id +
                            ". Open Owner / Admin Control Panel → Permanent Gateway Permit and complete secure server setup to enable checkout."
                    }
                }
                .onFailure { _message.value = it.message ?: "Payment could not be created." }
            _busy.value = false
        }
    }

    fun applyEmi(paymentId: String, tenureMonths: Int) {
        viewModelScope.launch {
            _busy.value = true
            repository.createEmiSchedule(
                EmiSchedule(
                    id = "",
                    paymentId = paymentId,
                    tenureMonths = tenureMonths,
                    annualInterestBasisPoints = 0,
                    processingFeeMinor = 0,
                    downPaymentMinor = 0,
                    autoDebitRequested = false,
                    status = EmiSchedule.Status.PENDING
                )
            ).onSuccess { _message.value = "EMI application created: " + it.id }
                .onFailure { _message.value = it.message ?: "EMI application failed." }
            _busy.value = false
        }
    }
}
