# elpriser.org /api/slots -> evcc rates ([{start, end, value}], value = currency per kWh)
#
# The service already delivers absolute UTC slots ({start, end, price, type}): 15 minutes
# wherever the day-ahead market has 15-minute prices, hourly for the model's forecast days,
# daylight saving handled server-side. Nothing is left to do here but to rename `price`.
.slots | map({ start, end, value: .price }) | tostring
