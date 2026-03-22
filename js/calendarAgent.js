const CalendarAgent = (() => {
  function toGCalDate(dateStr) {
    // YYYY-MM-DD → YYYYMMDD
    return dateStr.replace(/-/g, '');
  }

  function buildGoogleCalendarUrl(notice) {
    const title = encodeURIComponent(notice.title);
    const details = encodeURIComponent(
      notice.summary + (notice.link ? `\n\n원문: ${notice.link}` : '') +
      `\n\n출처: ${notice.sourceName} (${notice.sourceUrl})`
    );

    let dates;
    if (notice.deadline) {
      const start = toGCalDate(notice.deadline);
      const endDate = new Date(notice.deadline);
      endDate.setDate(endDate.getDate() + 1);
      const end = endDate.toISOString().split('T')[0].replace(/-/g, '');
      dates = `${start}/${end}`;
    } else {
      const today = new Date();
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);
      const start = today.toISOString().split('T')[0].replace(/-/g, '');
      const end = tomorrow.toISOString().split('T')[0].replace(/-/g, '');
      dates = `${start}/${end}`;
    }

    return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${title}&details=${details}&dates=${dates}`;
  }

  return {
    addToCalendar(notice) {
      const url = buildGoogleCalendarUrl(notice);
      window.open(url, '_blank');
    }
  };
})();

window.CalendarAgent = CalendarAgent;
