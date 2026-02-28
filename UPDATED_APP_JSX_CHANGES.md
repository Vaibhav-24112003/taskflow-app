# Updates to App.jsx

## SECTION 1: Update RECURRENCE_TYPES constant (line 14)
OLD: `const RECURRENCE_TYPES = ['none','daily','weekly','monthly']`

NEW: `const RECURRENCE_TYPES = ['none','daily','weekly','biweekly','monthly','quarterly','yearly','custom']`

## SECTION 2: Add helper functions after nextRecurringDate (after line 33)
- `getUpcomingRecurrences(dueDate, type, interval, count = 3) { ... }`
- `isRecurrenceExpired(nextDueDate, endDate) { ... }`
- Updated `nextRecurringDate()` to support all types: daily, weekly, biweekly, monthly, quarterly, yearly, custom

## SECTION 3: TaskFormModal state additions (after line 388)
- `const [recurrenceEndDate, setRecurrenceEndDate] = useState(null);`
- `const [upcomingRecurrences, setUpcomingRecurrences] = useState([]);`

## SECTION 4: Update useEffect (lines 392-406)
- Initialize `recurrenceEndDate` from task or null
- Add new useEffect to update `upcomingRecurrences` when `recurrenceType/Interval` changes

## SECTION 5: Update handleSave payload (lines 414-423)
- Add `recurrence_end_date: recurrenceEndDate || null`

## SECTION 6: Update form UI for recurrence section
- Replace select with all new recurrence type options
- Add recurrence interval input
- Add recurrence end date picker
- Add preview section with upcoming recurrences

## SECTION 7: Update handleSaveTask logic (lines 744-763)
- Check `isRecurrenceExpired` before creating next task
- Only create next task if `nextDue <= recurrenceEndDate`

## SECTION 8: Update TaskCard (after line 587)
- Add recurring badge showing pattern and end date if set