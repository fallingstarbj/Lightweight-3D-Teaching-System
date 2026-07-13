const reveals = document.querySelectorAll('.reveal')

const observer = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible')
      }
    })
  },
  { threshold: 0.12, rootMargin: '0px 0px -40px 0px' }
)

reveals.forEach((el) => observer.observe(el))

const yearEl = document.getElementById('year')
if (yearEl) {
  yearEl.textContent = String(new Date().getFullYear())
}
