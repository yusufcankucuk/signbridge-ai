import { SessionManager } from '../lib/stateMachine';

const testSession = SessionManager.createSession('test-123');
console.log('1. Başlangıç Durumu:', testSession.state); // Beklenen: idle

// Geçerli bir geçiş testi
const canGoToCapture = SessionManager.canTransition('idle', 'patient_capture');
console.log('2. idle -> patient_capture geçiş izni:', canGoToCapture); // Beklenen: true

// Geçersiz bir geçiş testi (Onay almadan doktora geçmeye çalışma)
const canSkipToDoctor = SessionManager.canTransition('patient_capture', 'doctor_review');
console.log('3. Onay atlayıp doktora geçiş izni:', canSkipToDoctor); // Beklenen: false

// Oturumu temizleme testi
const isEnded = SessionManager.endSession('test-123');
console.log('4. Oturum temizlendi mi?:', isEnded); // Beklenen: true
