import { expect, test } from "@playwright/test";

test("главная → ввод ИНН → сводка → детали → аудит", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/login/);
  await page.getByLabel("Пароль").fill("admin");
  await page.getByRole("button", { name: "Войти" }).click();

  await expect(page.getByRole("heading", { name: "Профиль кредитора" })).toBeVisible();
  await expect(page.getByTestId("disclaimer").first()).toContainText("информационно-аналитический");
  await page.getByLabel("ИНН или номер дела").fill("7701234567");
  await page.getByRole("button", { name: /Рассчитать/ }).click();

  await expect(page.getByText("Ожидаемая выплата")).toBeVisible();
  await expect(page.getByLabel("Светофор рисков")).toBeVisible();
  await expect(page.getByText("Вероятностный прогноз").first()).toBeVisible();
  await expect(page.getByTestId("disclaimer")).toBeVisible();

  await page.getByRole("link", { name: "Детали" }).first().click();
  await expect(page.getByRole("heading", { name: "Сценарии" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Стоимость действий" })).toBeVisible();

  await page.getByRole("link", { name: "Аудит" }).first().click();
  await expect(page.getByRole("heading", { name: "Формулы" })).toBeVisible();
});

test("служебные страницы существуют и содержат дисклеймер", async ({ page }) => {
  for (const path of ["/terms", "/privacy", "/offer", "/register"]) {
    await page.goto(path);
    await expect(page.getByTestId("disclaimer")).toBeVisible();
  }
  await page.goto("/register");
  await page.getByLabel("Email").fill("x@y.ru");
  await page.getByLabel("Пароль").fill("secret1");
  await page.getByRole("button", { name: "Зарегистрироваться" }).click();
  await expect(page.getByRole("alert")).toContainText("Регистрация временно недоступна");
});
