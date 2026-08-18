// Takvim GÜNÜ yardımcıları — "kullanıcının yerel günü"nün TEK KAYNAĞI.
//
// ###########################################################################
// # NEDEN AYRI BİR DOSYA (ve neden `useNutritionLogs.ts` DEĞİL)              #
// #                                                                          #
// # `todayIsoDate` eskiden `hooks/useNutritionLogs.ts` içinde yaşıyordu   #
// # ve `useProgressEntries.ts` onu ORADAN import ediyordu — yani "ilerleme    #
// # ölçümü" dilimi "beslenme" dilimine bağımlıydı. Bu ters bağımlılık üçüncü  #
// # bir yazma yolu (ilerleme fotoğrafı, günlük log) eklendiğinde her seferinde#
// # ya tekrar ediliyor ya da yeni bir yerel-tarih hesabı İCAT ediliyordu.     #
// # Tarih hesabını hook katmanının DIŞINA, saf bir modüle taşımak "yerel gün" #
// # kavramını tek bir yerde tutar: dört yazma yolu da (nutrition_logs,        #
// # daily_logs, progress_entries, progress_photos) ve okuma filtreleri AYNI   #
// # fonksiyonu çağırır, dolayısıyla yazılan gün ile okunan gün ASLA           #
// # ayrışamaz.                                                                #
// #                                                                           #
// # `Date#toISOString()` BU DOSYADA HİÇ KULLANILMAZ: o UTC'ye çevirir. UTC+3  #
// # (Türkiye) için yerel 00:00–03:00 arası UTC'de HÂLÂ ÖNCEKİ GÜNDÜR; gece    #
// # 01:00'de eklenen bir öğün "dün"e yazılır, dashboard "bugün"ü filtreler ve #
// # kayıt hiç görünmez. Ölçülmüş gerçek hatadır — bkz.                        #
// # apps/web/tests/unit/local-date-consistency.test.ts.                                #
// ###########################################################################

/**
 * Tarayıcının/çalıştığı ortamın YEREL takvim gününü `YYYY-MM-DD` döner.
 *
 * Yerel alanlar (`getFullYear`/`getMonth`/`getDate`) KULLANILIR; `toISOString`
 * KULLANILMAZ (bkz. dosya başı notu — gece yarısı penceresinde gün kaydırır).
 *
 * Bu değer TÜM `date` kolonlarının (`nutrition_logs.log_date`,
 * `daily_logs.log_date`, `progress_entries.entry_date`,
 * `progress_photos.taken_on`) İSTEMCİ tarafından AÇIKÇA gönderilen kaynağıdır.
 * Şemadaki `default current_date` yalnızca bir GÜVENLİK AĞIDIR (ve o UTC'dir);
 * uygulama koduna ait hiçbir yazma yolu ona düşmemelidir — bu yüzden ilgili
 * girdi tiplerinde tarih alanı OPSİYONEL DEĞİL ZORUNLUDUR.
 */
export function todayIsoDate(): string {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}
